# Generalise to All SG Private Property — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalise the calculator from "landed property, both-SC married couple" to all SG private property: any property type (Condo / Landed), any buyer mode (Solo / Joint), per-buyer residency (SC / SPR / Foreigner), with mixed-couple ABSD remission for first matrimonial home.

**Architecture:** All work lives in `src/App.jsx` (single-file React component) plus repo metadata files. The current hard-coded ABSD ladder is replaced with a residency × property-order lookup. New state for property type, buyer mode, per-buyer residency, and ABSD remission is added; existing TDSR / LTV / BSD / cash-vs-CPF logic is residency-agnostic and stays untouched. The localStorage key is bumped with a one-shot migration from the old key.

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, browser localStorage. No test runner — verification at each task is manual via the Vite dev server (`npm run dev`).

**Spec:** `docs/superpowers/specs/2026-05-09-generalise-private-property-design.md`.

**Branch:** `claude/generalise-private-property` (already exists, contains the spec commits).

---

## Task 1: Update repo-name references

**Files:**
- Modify: `vite.config.js:10`
- Modify: `README.md` (lines 12, 20, 31, 35, 44)
- Modify: `package.json:2`
- Modify: `package-lock.json:2,8`

The repo was renamed to `sg-property-affordability`. All in-repo references must point at the new name. Vite's `base` controls asset URLs on Pages — getting this wrong breaks the deployed site.

- [ ] **Step 1.1: Update Vite base path**

In `vite.config.js`, change line 10:

```js
  base: "/sg-property-affordability/",
```

- [ ] **Step 1.2: Update README**

In `README.md`, replace every occurrence of `sg-landed-affordability` with `sg-property-affordability`. Confirm with:

```bash
grep -n "sg-landed-affordability" README.md
```

Expected: no matches.

- [ ] **Step 1.3: Update package.json name**

In `package.json`, change line 2:

```json
  "name": "sg-property-affordability",
```

- [ ] **Step 1.4: Regenerate package-lock.json name fields**

Run from the repo root:

```bash
npm install
```

This rewrites `package-lock.json`'s top-level and nested `name` fields to match `package.json`. Confirm:

```bash
grep -n "\"name\":" package-lock.json | head -3
```

Expected: top two `"name"` lines say `"sg-property-affordability"`.

- [ ] **Step 1.5: Smoke-test the dev server at the new base**

```bash
npm run dev
```

Open `http://localhost:5173/sg-property-affordability/` and confirm the app loads (current "Landed Property" UI is fine — branding update comes later). Stop the server.

- [ ] **Step 1.6: Commit**

```bash
git add vite.config.js README.md package.json package-lock.json
git commit -m "Update in-repo references to sg-property-affordability"
```

---

## Task 2: Refactor ABSD into a residency-aware helper (no behaviour change)

**Files:**
- Modify: `src/App.jsx` (insert helper near top of file; replace ABSD ladder around line 446-449)

This is a pure refactor. With residency hard-coded to `"sc"` for both buyers, the output is byte-for-byte identical to today's calc. Doing this first isolates the engine change from any UI change.

- [ ] **Step 2.1: Add ABSD lookup constants and helper**

Above the `// ----- Main component -----` line (~line 293) in `src/App.jsx`, insert:

```js
// ABSD rates by residency × property order (SG, post-27 Apr 2023).
// Joint purchases pay at the higher of the two buyers' rates. Mixed-couple
// remission for first matrimonial home applies the SC rate.
const ABSD_TABLE = {
  sc:        { first: 0.00, second: 0.20, third: 0.30 },
  spr:       { first: 0.05, second: 0.30, third: 0.35 },
  foreigner: { first: 0.60, second: 0.60, third: 0.60 },
};

function absdRateFor(residency, propertyOrder) {
  return ABSD_TABLE[residency][propertyOrder];
}

function isRemissionEligible({ buyerMode, residency1, residency2, propertyOrder }) {
  if (buyerMode !== "joint") return false;
  if (propertyOrder !== "first") return false;
  const r1IsSC = residency1 === "sc";
  const r2IsSC = residency2 === "sc";
  return (r1IsSC || r2IsSC) && !(r1IsSC && r2IsSC);
}

function effectiveAbsdRate({ buyerMode, residency1, residency2, propertyOrder, remission }) {
  if (remission && isRemissionEligible({ buyerMode, residency1, residency2, propertyOrder })) {
    return absdRateFor("sc", propertyOrder);
  }
  const r1 = absdRateFor(residency1, propertyOrder);
  if (buyerMode === "solo") return r1;
  const r2 = absdRateFor(residency2, propertyOrder);
  return Math.max(r1, r2);
}
```

- [ ] **Step 2.2: Replace the ABSD ladder inside the calc**

In `src/App.jsx`, find the block currently at ~line 446-449:

```js
    // ABSD (post-27 Apr 2023, both Singapore Citizens)
    let absdRate = 0;
    if (propertyOrder === "second") absdRate = 0.2;
    else if (propertyOrder === "third") absdRate = 0.3;
```

Replace it with:

```js
    // ABSD: residency × property-order lookup. Defaults below preserve the
    // pre-generalisation calc (both SC, joint, no remission) until the UI
    // wiring lands in later tasks.
    const absdRate = effectiveAbsdRate({
      buyerMode: "joint",
      residency1: "sc",
      residency2: "sc",
      propertyOrder,
      remission: false,
    });
```

- [ ] **Step 2.3: Verify behaviour identical**

```bash
npm run dev
```

Open the app. Click through 1st / 2nd / 3rd+ property order. ABSD line items in the breakdown should read 0% / 20% / 30% respectively, exactly as before. Max price for default inputs should match the pre-change baseline.

- [ ] **Step 2.4: Commit**

```bash
git add src/App.jsx
git commit -m "Refactor ABSD to residency-aware lookup helper"
```

---

## Task 3: Property type selector

**Files:**
- Modify: `src/App.jsx` (add state ~line 322; new selector block in inputs section ~line 853 area; conditional landed warning)

Adds a Condo / Landed selector at the top of the Loan & Property block (above Loan Tenure). Default is `condo`. Renders an inline note when Landed is chosen; the existing footer note (line 1527-1530) stays — the new note is a contextual reminder, not a replacement.

- [ ] **Step 3.1: Add property type state**

In `FACTORY_DEFAULTS` (~line 296):

```js
  propertyType: "condo",
```

In the component state declarations (~line 322), add:

```js
  const [propertyType, setPropertyType] = useState(FACTORY_DEFAULTS.propertyType);
```

In the load effect (~line 352), add:

```js
          if (typeof s.propertyType === "string") setPropertyType(s.propertyType);
```

In `saveAsDefaults` (the JSON.stringify object ~line 374-376), add `propertyType` alongside the other persisted fields.

In `resetToFactory` (~line 397), add:

```js
    setPropertyType(FACTORY_DEFAULTS.propertyType);
```

- [ ] **Step 3.2: Render the selector**

In the Loan & Property section, immediately under the `③ Loan & Property` heading and above the Loan Tenure block (around line 851, after the heading's closing `</h2>` and before the existing `<div className="mb-5">` for tenure), insert:

```jsx
              <div className="mb-5">
                <div
                  className="text-[11px] uppercase tracking-[0.14em] text-stone-600 mb-2"
                  style={{ fontWeight: 500 }}
                >
                  Property Type
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { v: "condo", label: "Condo / Apt" },
                    { v: "landed", label: "Landed" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setPropertyType(o.v)}
                      className="py-2.5 px-2 text-center transition-colors border"
                      style={{
                        background: propertyType === o.v ? "#1B4332" : "#FAF7EE",
                        color: propertyType === o.v ? "#FAF7EE" : "#1F2421",
                        borderColor: propertyType === o.v ? "#1B4332" : "#D9D2BF",
                      }}
                    >
                      <div className="text-sm font-semibold">{o.label}</div>
                    </button>
                  ))}
                </div>
                {propertyType === "landed" && (
                  <p
                    className="text-[11px] italic text-stone-600 mt-2 leading-relaxed"
                    style={{ fontFamily: '"Fraunces", serif' }}
                  >
                    Mainland landed property may only be purchased by Singapore
                    Citizens; Sentosa Cove permits PRs subject to LDAU approval.
                  </p>
                )}
              </div>
```

(The non-SC escalation of this note is added in Task 4 once residency state exists.)

- [ ] **Step 3.3: Verify**

```bash
npm run dev
```

- Toggle between Condo and Landed; the inline note appears under Landed, disappears under Condo.
- Save defaults, reload page, confirm Landed selection persists.
- Reset to factory, confirm property type returns to Condo.

- [ ] **Step 3.4: Commit**

```bash
git add src/App.jsx
git commit -m "Add Condo / Landed property type selector"
```

---

## Task 4: Per-buyer residency

**Files:**
- Modify: `src/App.jsx` (state, persistence, spouse cards UI, ABSD call site)

Adds a residency dropdown to each spouse card and wires the calc through `effectiveAbsdRate`. Defaults to `sc` for both — no behaviour change on first load. Also escalates the landed note to a warning when a non-SC buyer is selected.

- [ ] **Step 4.1: Add residency state**

In `FACTORY_DEFAULTS`:

```js
  residency1: "sc",
  residency2: "sc",
```

In the component:

```js
  const [residency1, setResidency1] = useState(FACTORY_DEFAULTS.residency1);
  const [residency2, setResidency2] = useState(FACTORY_DEFAULTS.residency2);
```

In the load effect:

```js
          if (typeof s.residency1 === "string") setResidency1(s.residency1);
          if (typeof s.residency2 === "string") setResidency2(s.residency2);
```

In `saveAsDefaults`, add `residency1, residency2` to the persisted object.

In `resetToFactory`:

```js
    setResidency1(FACTORY_DEFAULTS.residency1);
    setResidency2(FACTORY_DEFAULTS.residency2);
```

- [ ] **Step 4.2: Add a Residency dropdown component (inline)**

Inside the component, just above the `return (` (~line 638), add a small reusable inline renderer to keep the spouse cards readable:

```jsx
  const renderResidencySelect = (value, onChange) => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-stone-500">
        Residency
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm py-1.5 px-2 border bg-[#FAF7EE]"
        style={{ borderColor: "#D9D2BF", color: "#1F2421" }}
      >
        <option value="sc">SG Citizen</option>
        <option value="spr">SG PR</option>
        <option value="foreigner">Foreigner</option>
      </select>
    </label>
  );
```

- [ ] **Step 4.3: Render dropdowns in each spouse card**

In the Spouse 1 column (~line 801-808), append after the CPF input:

```jsx
                  {renderResidencySelect(residency1, setResidency1)}
```

Same for Spouse 2 (~line 809-816):

```jsx
                  {renderResidencySelect(residency2, setResidency2)}
```

- [ ] **Step 4.4: Wire residencies into the calc**

In the `useMemo` body (the ABSD call from Task 2.2), replace the hard-coded `residency1: "sc"`, `residency2: "sc"` with the state:

```js
    const absdRate = effectiveAbsdRate({
      buyerMode: "joint",
      residency1,
      residency2,
      propertyOrder,
      remission: false,
    });
```

Add `residency1, residency2` to the `useMemo` dependency array (~line 629-630).

- [ ] **Step 4.5: Escalate the landed note for non-SC buyers**

Replace the `propertyType === "landed"` note from Task 3.2 with a warning variant when a non-SC buyer is selected:

```jsx
                {propertyType === "landed" && (
                  (residency1 !== "sc" || residency2 !== "sc") ? (
                    <p
                      className="text-[11px] mt-2 px-3 py-2 leading-relaxed"
                      style={{
                        background: "rgba(160,76,45,0.08)",
                        color: "#A04C2D",
                        fontFamily: '"Fraunces", serif',
                        fontStyle: "italic",
                      }}
                    >
                      ⚠ Mainland landed property requires Singapore Citizenship.
                      Calculation continues for reference only.
                    </p>
                  ) : (
                    <p
                      className="text-[11px] italic text-stone-600 mt-2 leading-relaxed"
                      style={{ fontFamily: '"Fraunces", serif' }}
                    >
                      Mainland landed property may only be purchased by Singapore
                      Citizens; Sentosa Cove permits PRs subject to LDAU approval.
                    </p>
                  )
                )}
```

- [ ] **Step 4.6: Verify**

```bash
npm run dev
```

- Default load: ABSD line still 0% / 20% / 30% per property order. No regression.
- Set Spouse 2 to Foreigner, property order 1st: ABSD jumps to 60%, max price drops sharply.
- Set Spouse 1 to SPR, Spouse 2 to SC, 2nd property: ABSD = 30% (SPR's rate, the higher).
- Set Property Type = Landed and either spouse to non-SC: warning banner appears.

- [ ] **Step 4.7: Commit**

```bash
git add src/App.jsx
git commit -m "Per-buyer residency dropdowns wired into ABSD"
```

---

## Task 5: Foreigner CPF gate

**Files:**
- Modify: `src/App.jsx`

When a buyer's residency is `foreigner`, their CPF OA input is disabled and their CPF balance is treated as zero in the calc. The user's typed value is preserved in component state so switching back to SC/SPR restores it.

- [ ] **Step 5.1: Zero out foreigner CPF in the calc**

In the `useMemo` body, replace the existing `totalCPF` line (~line 415):

```js
    const totalCPF = Math.max(0, cpf1 + cpf2);
```

with:

```js
    const cpf1Eff = residency1 === "foreigner" ? 0 : cpf1;
    const cpf2Eff = residency2 === "foreigner" ? 0 : cpf2;
    const totalCPF = Math.max(0, cpf1Eff + cpf2Eff);
```

(`cpf1` and `cpf2` themselves stay unchanged — they remain in component state for round-tripping.)

- [ ] **Step 5.2: Disable CPF inputs in UI when residency is foreigner**

In the Spouse 1 card (~line 807):

```jsx
                  <NumberInput
                    label="CPF OA"
                    value={cpf1}
                    onChange={setCpf1}
                    prefix="S$"
                    disabled={residency1 === "foreigner"}
                    hint={residency1 === "foreigner" ? "Foreigners cannot use CPF" : undefined}
                  />
```

Same for Spouse 2 (~line 815) using `residency2` / `cpf2` / `setCpf2`.

- [ ] **Step 5.3: Add `disabled` support to NumberInput**

`NumberInput` is defined at `src/App.jsx:76-233`. Three precise edits:

(a) On line 76, add `disabled = false` to the destructured props:

```js
const NumberInput = ({ label, value, onChange, prefix, suffix, hint, decimal = false, disabled = false }) => {
```

(b) On line 185, swap the static `<label className="block">` for one that dims when disabled:

```jsx
    <label className={`block ${disabled ? "opacity-50" : ""}`}>
```

(c) On line 211 (the `<input ref={inputRef}` block), add a `disabled` attribute. Replace:

```jsx
        <input
          ref={inputRef}
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          value={display}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="w-full px-3 py-2.5 bg-transparent outline-none text-stone-900 text-base"
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontVariantNumeric: "tabular-nums",
          }}
        />
```

with:

```jsx
        <input
          ref={inputRef}
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          value={display}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          className={`w-full px-3 py-2.5 bg-transparent outline-none text-stone-900 text-base ${disabled ? "cursor-not-allowed" : ""}`}
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontVariantNumeric: "tabular-nums",
          }}
        />
```

(No other internal logic needs changing — a disabled `<input>` doesn't fire `onChange`, `onFocus`, or `onBlur`, so the formatting handlers are inert when disabled.)

- [ ] **Step 5.4: Verify**

```bash
npm run dev
```

- Set Spouse 1 to Foreigner: CPF input greys out, hint reads "Foreigners cannot use CPF". Max price drops (no CPF available).
- Set CPF OA to a value, switch to SC, switch back to Foreigner: the typed value is preserved (input shows the previous number when re-enabled). Calc still treats it as 0 while Foreigner.

- [ ] **Step 5.5: Commit**

```bash
git add src/App.jsx
git commit -m "Disable and zero CPF for Foreigner buyers"
```

---

## Task 6: Solo / Joint buyer mode

**Files:**
- Modify: `src/App.jsx`

Adds a Solo / Joint toggle at the top of the inputs section. In Solo mode, Buyer 2's spouse card and CPF / income contribution disappear; the ABSD effective rate uses only Buyer 1's residency.

- [ ] **Step 6.1: Add buyer mode state**

In `FACTORY_DEFAULTS`:

```js
  buyerMode: "joint",
```

In the component:

```js
  const [buyerMode, setBuyerMode] = useState(FACTORY_DEFAULTS.buyerMode);
```

Load effect:

```js
          if (typeof s.buyerMode === "string") setBuyerMode(s.buyerMode);
```

`saveAsDefaults`: add `buyerMode` to the persisted object.

`resetToFactory`:

```js
    setBuyerMode(FACTORY_DEFAULTS.buyerMode);
```

- [ ] **Step 6.2: Render the Solo/Joint toggle**

In the inputs section, immediately above the `① The Couple` heading (~line 791), insert:

```jsx
            <div className="-mt-2">
              <div
                className="text-[11px] uppercase tracking-[0.14em] text-stone-600 mb-2"
                style={{ fontWeight: 500 }}
              >
                Buyer Mode
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { v: "solo", label: "Solo" },
                  { v: "joint", label: "Joint" },
                ].map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setBuyerMode(o.v)}
                    className="py-2 px-2 text-center transition-colors border"
                    style={{
                      background: buyerMode === o.v ? "#1B4332" : "#FAF7EE",
                      color: buyerMode === o.v ? "#FAF7EE" : "#1F2421",
                      borderColor: buyerMode === o.v ? "#1B4332" : "#D9D2BF",
                    }}
                  >
                    <div className="text-sm font-semibold">{o.label}</div>
                  </button>
                ))}
              </div>
            </div>
```

- [ ] **Step 6.3: Conditionally hide Buyer 2 card and rename headings**

Find the `① The Couple` heading (~line 791-797). Change the static text to react to mode:

```jsx
                <h2
                  className="text-[11px] uppercase tracking-[0.2em]"
                  style={{ fontWeight: 600, color: "#1B4332" }}
                >
                  {buyerMode === "solo" ? "① The Buyer" : "① The Couple"}
                </h2>
```

Find the grid containing both spouse columns (~line 800). Wrap the Buyer 2 column in a conditional:

```jsx
              <div className={buyerMode === "solo" ? "" : "grid grid-cols-2 gap-4"}>
                <div className="space-y-3">
                  <p className="text-xs text-stone-600 italic" style={{ fontFamily: '"Fraunces", serif' }}>
                    {buyerMode === "solo" ? "Buyer" : "Spouse 1"}
                  </p>
                  {/* ...existing Spouse 1 inputs... */}
                </div>
                {buyerMode === "joint" && (
                  <div className="space-y-3">
                    <p className="text-xs text-stone-600 italic" style={{ fontFamily: '"Fraunces", serif' }}>
                      Spouse 2
                    </p>
                    {/* ...existing Spouse 2 inputs... */}
                  </div>
                )}
              </div>
```

- [ ] **Step 6.4: Treat Buyer 2 as zero in the calc when Solo**

In the `useMemo` body, near the top (replacing the existing `totalIncome` line ~line 413 and adjusting the other Buyer-2 references):

```js
    const income2Eff = buyerMode === "solo" ? 0 : income2;
    const age2Eff = buyerMode === "solo" ? 0 : age2;
    const cpf2Eff = (buyerMode === "solo" || residency2 === "foreigner") ? 0 : cpf2;
    const cpf1Eff = residency1 === "foreigner" ? 0 : cpf1;

    const totalIncome = income1 + income2Eff;
    const totalCash = Math.max(0, cash);
    const totalCPF = Math.max(0, cpf1Eff + cpf2Eff);
    const totalFunds = totalCash + totalCPF;
```

(This consolidates the Task 5 cpf-zeroing block. Delete the now-duplicated `cpf1Eff` / `cpf2Eff` lines from Step 5.1 if still present — there should be exactly one definition of each in the calc.)

Update the income-weighted age calc (~line 424-427) to use `age2Eff` and `income2Eff`:

```js
    const weightedAge =
      totalIncome > 0
        ? (age1 * income1 + age2Eff * income2Eff) / totalIncome
        : (age1 + age2Eff) / 2;
```

- [ ] **Step 6.5: Wire buyerMode into ABSD**

In the `effectiveAbsdRate` call (Task 4.4), replace the hard-coded `buyerMode: "joint"`:

```js
    const absdRate = effectiveAbsdRate({
      buyerMode,
      residency1,
      residency2,
      propertyOrder,
      remission: false,
    });
```

Add `buyerMode` to the `useMemo` dependency array.

- [ ] **Step 6.6: Verify**

```bash
npm run dev
```

- Default load (Joint): same numbers as before this task.
- Switch to Solo: Spouse 2 card disappears, heading reads "The Buyer". Max price drops because Buyer 2's income / CPF no longer count.
- Switch Buyer 1 to Foreigner in Solo: ABSD = 60%.
- Switch back to Joint: Spouse 2 reappears with previously typed values intact.

- [ ] **Step 6.7: Commit**

```bash
git add src/App.jsx
git commit -m "Solo / Joint buyer mode toggle"
```

---

## Task 7: ABSD remission for first matrimonial home

**Files:**
- Modify: `src/App.jsx`

Add a checkbox under the Property Order block that's only rendered when `isRemissionEligible(...)` is true. When checked, the calc uses the SC rate at the chosen property order.

- [ ] **Step 7.1: Add remission state**

In `FACTORY_DEFAULTS`:

```js
  absdRemission: false,
```

In the component:

```js
  const [absdRemission, setAbsdRemission] = useState(FACTORY_DEFAULTS.absdRemission);
```

Load effect:

```js
          if (typeof s.absdRemission === "boolean") setAbsdRemission(s.absdRemission);
```

`saveAsDefaults`: add `absdRemission`.

`resetToFactory`:

```js
    setAbsdRemission(FACTORY_DEFAULTS.absdRemission);
```

- [ ] **Step 7.2: Wire remission into ABSD**

Update the `effectiveAbsdRate` call:

```js
    const absdRate = effectiveAbsdRate({
      buyerMode,
      residency1,
      residency2,
      propertyOrder,
      remission: absdRemission,
    });
```

Add `absdRemission` to the `useMemo` dependency array.

- [ ] **Step 7.3: Render the checkbox**

Immediately after the Property Order grid (after the closing `</div>` of the `grid grid-cols-3 gap-1.5` block, around line 1001-1002), insert:

```jsx
                {isRemissionEligible({ buyerMode, residency1, residency2, propertyOrder }) && (
                  <label className="flex items-start gap-2 mt-3 text-[12px] text-stone-700 leading-relaxed cursor-pointer">
                    <input
                      type="checkbox"
                      checked={absdRemission}
                      onChange={(e) => setAbsdRemission(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span style={{ fontFamily: '"Fraunces", serif', fontStyle: "italic" }}>
                      First matrimonial home — apply mixed-couple ABSD remission
                      (uses the SC rate)
                    </span>
                  </label>
                )}
```

When the predicate flips to false (e.g., user changes property order to 2nd), the checkbox disappears. Its underlying boolean state is harmless but ignored — `effectiveAbsdRate` only honours it when eligible.

- [ ] **Step 7.4: Verify**

```bash
npm run dev
```

- Joint, Spouse 1 = SC, Spouse 2 = Foreigner, 1st property: checkbox renders. ABSD = 60% off; checking the box drops it to 0%.
- Same buyers, switch to 2nd property: checkbox disappears; ABSD stays at 60%.
- Both buyers SC: checkbox never renders.
- Solo: checkbox never renders.

- [ ] **Step 7.5: Commit**

```bash
git add src/App.jsx
git commit -m "ABSD remission checkbox for first matrimonial home"
```

---

## Task 8: Branding rebrand

**Files:**
- Modify: `src/App.jsx` (component name, hero header)
- Modify: `index.html` (page title, meta description)
- Modify: `README.md` (title and copy)
- Modify: `package.json` (description)

Cosmetic only. Component rename last — easier to grep references.

- [ ] **Step 8.1: Update HTML title and meta**

In `index.html`, replace:

```html
    <title>Landed Property Affordability · Singapore</title>
    <meta
      name="description"
      content="Affordability calculator for Singapore landed property — TDSR, LTV, BSD/ABSD, cash vs CPF deployment, with reverse calculation."
    />
```

with:

```html
    <title>Private Property Affordability · Singapore</title>
    <meta
      name="description"
      content="Affordability calculator for Singapore private property (condo & landed) — TDSR, LTV, BSD/ABSD, cash vs CPF deployment, with reverse calculation."
    />
```

- [ ] **Step 8.2: Update hero header**

In `src/App.jsx` (~line 727), replace:

```jsx
            Landed Property
            <span style={{ fontStyle: "italic", fontWeight: 300 }}> Affordability</span>
```

with:

```jsx
            Private Property
            <span style={{ fontStyle: "italic", fontWeight: 300 }}> Affordability</span>
```

- [ ] **Step 8.3: Rename the React component**

In `src/App.jsx`, change `export default function LandedAffordabilityCalculator()` (~line 312) to:

```jsx
export default function PrivatePropertyAffordabilityCalculator() {
```

Confirm no other reference exists:

```bash
grep -n "LandedAffordabilityCalculator" src/App.jsx src/main.jsx
```

Expected: no matches.

- [ ] **Step 8.4: Update README**

Rewrite `README.md` so the title is **Private Property Affordability · Singapore** and the prose covers:

- Scope: Singapore private property (condo or landed), Solo or Joint buyer, residency mix.
- ABSD table (the same table as in the spec).
- A note that mainland landed requires Singapore Citizenship; Sentosa Cove permits PRs subject to LDAU approval.
- A note that Foreigners cannot use CPF.
- Existing "Local development", "Deploy to GitHub Pages", "Stack", and "What it models" sections — update wording to drop "landed" framing where it appears.

The reference URL `https://thespacemanatee.github.io/sg-property-affordability/` is already correct from Task 1.

- [ ] **Step 8.5: Update package.json description**

```json
  "description": "Singapore private property affordability calculator (condo & landed)",
```

- [ ] **Step 8.6: Verify**

```bash
npm run dev
```

- Browser tab title reads "Private Property Affordability · Singapore".
- Hero header reads "Private Property Affordability".
- Footer "Citizenship" note still present (it's still correct for landed).

- [ ] **Step 8.7: Commit**

```bash
git add src/App.jsx index.html README.md package.json
git commit -m "Rebrand to Private Property Affordability"
```

---

## Task 9: Storage migration

**Files:**
- Modify: `src/App.jsx` (STORAGE_KEY and load effect)

Bumps the localStorage key. On first mount, if the new key is absent and the old key is present, read the old key, write a new-key record, delete the old key. Subsequent loads use only the new key.

- [ ] **Step 9.1: Bump the storage key**

In `src/App.jsx` (~line 295):

```js
const STORAGE_KEY = "private_property_affordability_v1";
const LEGACY_STORAGE_KEY = "landed_affordability_defaults_v1";
```

- [ ] **Step 9.2: Add migration step inside the load effect**

Replace the load effect (currently ~line 336-367) with:

```js
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof window === "undefined") {
          if (!cancelled) setHydrated(true);
          return;
        }
        let raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            try {
              JSON.parse(legacy); // sanity-check before migrating
              window.localStorage.setItem(STORAGE_KEY, legacy);
              window.localStorage.removeItem(LEGACY_STORAGE_KEY);
              raw = legacy;
            } catch {
              // Legacy payload corrupted — leave it and fall back to factory.
            }
          }
        }
        if (!cancelled && raw) {
          const s = JSON.parse(raw);
          if (typeof s.age1 === "number") setAge1(s.age1);
          if (typeof s.income1 === "number") setIncome1(s.income1);
          if (typeof s.age2 === "number") setAge2(s.age2);
          if (typeof s.income2 === "number") setIncome2(s.income2);
          if (typeof s.existingDebt === "number") setExistingDebt(s.existingDebt);
          if (typeof s.cash === "number") setCash(s.cash);
          if (typeof s.cpf1 === "number") setCpf1(s.cpf1);
          if (typeof s.cpf2 === "number") setCpf2(s.cpf2);
          if (typeof s.tenure === "number") setTenure(s.tenure);
          if (typeof s.propertyOrder === "string") setPropertyOrder(s.propertyOrder);
          if (typeof s.stressRate === "number") setStressRate(s.stressRate);
          if (typeof s.marketRate === "number") setMarketRate(s.marketRate);
          if (s.ltvTarget === null || typeof s.ltvTarget === "number")
            setLtvTarget(s.ltvTarget);
          if (typeof s.propertyType === "string") setPropertyType(s.propertyType);
          if (typeof s.buyerMode === "string") setBuyerMode(s.buyerMode);
          if (typeof s.residency1 === "string") setResidency1(s.residency1);
          if (typeof s.residency2 === "string") setResidency2(s.residency2);
          if (typeof s.absdRemission === "boolean") setAbsdRemission(s.absdRemission);
          setSavedHasDefaults(true);
        }
      } catch (err) {
        // No saved defaults — fall back to factory.
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
```

The new fields (`propertyType`, `buyerMode`, `residency1`, `residency2`, `absdRemission`) are absent in any legacy payload — those `typeof` guards keep the factory defaults in that case, which is the desired behaviour (legacy users land on Condo / Joint / SC+SC / no remission, matching what they had before).

- [ ] **Step 9.3: Verify migration with seeded localStorage**

```bash
npm run dev
```

In the browser dev console at `http://localhost:5173/sg-property-affordability/`, before any "save defaults" interaction, run:

```js
localStorage.clear();
localStorage.setItem("landed_affordability_defaults_v1", JSON.stringify({
  age1: 40, income1: 25000, age2: 38, income2: 18000,
  existingDebt: 1200, cash: 1500000, cpf1: 250000, cpf2: 200000,
  tenure: 30, propertyOrder: "first", stressRate: 4.0, marketRate: 3.5,
  ltvTarget: null,
}));
location.reload();
```

After reload:

- App should load with age1 = 40, income1 = 25000, etc. (legacy values restored).
- `localStorage.getItem("landed_affordability_defaults_v1")` returns `null`.
- `localStorage.getItem("private_property_affordability_v1")` returns the JSON payload.
- Property type, buyer mode, residencies, and remission are at factory defaults (Condo / Joint / SC+SC / false).

- [ ] **Step 9.4: Verify new save+reload**

In the UI: change Buyer Mode to Solo, Property Type to Landed, click "Save as defaults", reload. All choices persist. Click "Reset" — values return to factory and `localStorage.getItem("private_property_affordability_v1")` returns `null`.

- [ ] **Step 9.5: Commit**

```bash
git add src/App.jsx
git commit -m "Bump storage key + one-shot migration from legacy key"
```

---

## Task 10: End-to-end manual verification + open PR

**Files:** none (verification only)

Walks through the verification matrix from the spec to catch any regressions before opening the PR.

- [ ] **Step 10.1: Run the full manual matrix**

```bash
npm run dev
```

For each row, verify the described outcome:

| # | State | Expected |
|---|-------|----------|
| 1 | Default load (Joint, SC+SC, Condo, 1st, no remission) | Same max price as on the `main` branch with the same inputs |
| 2 | Switch to Solo | Spouse 2 card hidden, heading reads "The Buyer", max price drops |
| 3 | Spouse 2 = Foreigner, 1st property | ABSD = 60%, max price drops sharply, Spouse 2 CPF disabled |
| 4 | Same as #3 + tick remission checkbox | ABSD = 0%, max price recovers significantly |
| 5 | Property Type = Landed, Spouse 2 = SPR | Warning banner appears under selector |
| 6 | Solo + Buyer 1 = Foreigner, 3rd property | ABSD = 60%, no remission checkbox, Buyer 1 CPF disabled |
| 7 | Save defaults with non-default state, reload | All choices persist |
| 8 | Reset | All values return to factory defaults |
| 9 | Snap-to-max status (re-verify the earlier fix) | Default state reads "Within reach" |

If any row fails, fix in place and re-run the failing rows. Don't proceed to the PR until all pass.

- [ ] **Step 10.2: Build to catch any unused imports / syntax issues**

```bash
npm run build
```

Expected: build succeeds, `dist/` produced.

- [ ] **Step 10.3: Push and open PR**

```bash
git push -u origin claude/generalise-private-property
```

Open a PR titled **"Generalise calculator to all SG private property"** against `main`. Body should summarise:

- Property type, buyer mode, per-buyer residency, ABSD remission added.
- ABSD ladder replaced with residency-aware lookup.
- Repo-name references updated to `sg-property-affordability`.
- Storage key bumped with one-shot migration from the legacy key.
- Test plan: the verification matrix from Step 10.1.

- [ ] **Step 10.4: Merge after review and confirm Pages deploy**

Squash-merge to `main`. Confirm the GitHub Actions deploy workflow runs and the live site at `https://thespacemanatee.github.io/sg-property-affordability/` reflects the new UI.
