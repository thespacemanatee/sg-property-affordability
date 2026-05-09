# Add HDB Property Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the calculator from private-only (Condo / Landed) to also cover HDB BTO and HDB Resale, including the HDB-specific mechanics that change affordability materially: MSR, the HDB Concessionary Loan, and CPF Housing Grants (EHG, Family, PHG, Singles).

**Architecture:** All UI and calc logic lives in `src/App.jsx` (single-file React component). Grant computation is extracted to a new pure module `src/grants.js`. The existing `propertyType` selector widens from `Condo|Landed` to `Condo|Landed|HDB BTO|HDB Resale`, and HDB-specific controls (loan type, first-timer, flat type, proximity) appear conditionally only when an HDB option is selected. The calc engine is parameterised by `(propertyType, loanType)` to derive stress floor, tenure cap, LTV, LTV-reducibility, and minimum cash. MSR is layered onto the existing TDSR pipeline for HDB modes only. Private code paths are untouched. The localStorage key bumps to `sg_property_affordability_v2` with no migration (per spec).

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, browser localStorage. No test runner — verification at each task is manual via the Vite dev server (`npm run dev`).

**Spec:** `docs/superpowers/specs/2026-05-09-add-hdb-property-support-design.md`.

**Branch:** `claude/add-hdb-property-support-CEY0V` (already exists, contains the spec commit).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/grants.js` | Create | Pure helpers: `computeGrants(...)` and constants for EHG tier table, Family Grant amounts, PHG amounts, Singles Grant amount, BTO income ceilings. No React. No DOM. |
| `src/App.jsx` | Modify | All UI and calc engine changes — widen property type, add loan type / HDB controls, eligibility warnings, derive `(stressFloor, tenureCap, ltv, ltvReducible, minCash)`, MSR cap, ABSD-on-BTO, grants integration into CPF, grant breakdown in results panel, storage key bump. |
| `index.html` | Modify | Page title rebrand from "Private Property" to "Singapore Property". |
| `README.md` | Modify | Add HDB section: property types supported, MSR explanation, loan-type comparison table, grants summary, eligibility warning matrix. |
| `package.json` | Modify | `description` field. |
| `package-lock.json` | Modify | Top-level `description` field (regenerated via `npm install`). |

---

## Task 1: State & storage scaffolding

**Files:**
- Modify: `src/App.jsx` (storage constants ~line 370, factory defaults ~line 372, state hooks ~line 433–457, share-link reader ~line 470–490, persistence reader ~line 505–550, persistence writer ~line 575–585, reset ~line 600–620, share-link encoder ~line 635–640, calc deps ~line 875–880)

Add the four new state items (`loanType`, `firstTimer`, `flatType`, `proximity`), widen the persisted payload, bump the storage key to v2, and remove the legacy v1 migration (per spec, no backwards compat).

- [ ] **Step 1.1: Bump storage key and remove legacy migration constant**

In `src/App.jsx`, replace lines 370–371:

```js
const STORAGE_KEY = "sg_property_affordability_v2";
```

(Remove the `LEGACY_STORAGE_KEY` constant entirely — no migration.)

- [ ] **Step 1.2: Add new fields to `FACTORY_DEFAULTS`**

In `src/App.jsx`, in the `FACTORY_DEFAULTS` object (~line 372), add these four fields alongside the existing ones (placement order doesn't matter, but for readability add them after `absdRemission`):

```js
  loanType: "hdb",
  firstTimer: true,
  flatType: "4room",
  proximity: "none",
```

- [ ] **Step 1.3: Widen `SHAREABLE_FIELDS`**

In `src/App.jsx`, update the `SHAREABLE_FIELDS` array (~line 330) to include the new fields:

```js
const SHAREABLE_FIELDS = [
  "buyerMode", "age1", "income1", "age2", "income2",
  "existingDebt1", "existingDebt2", "cash1", "cash2", "cpf1", "cpf2",
  "tenure", "propertyOrder", "stressRate", "marketRate", "ltvTarget",
  "propertyType", "buyerMode", "residency1", "residency2", "absdRemission",
  "loanType", "firstTimer", "flatType", "proximity",
];
```

- [ ] **Step 1.4: Add `useState` hooks for the four new fields**

In `src/App.jsx`, in the component body (~line 457, immediately after the `absdRemission` state hook), add:

```js
  const [loanType, setLoanType] = useState(FACTORY_DEFAULTS.loanType);
  const [firstTimer, setFirstTimer] = useState(FACTORY_DEFAULTS.firstTimer);
  const [flatType, setFlatType] = useState(FACTORY_DEFAULTS.flatType);
  const [proximity, setProximity] = useState(FACTORY_DEFAULTS.proximity);
```

- [ ] **Step 1.5: Wire share-link reader for new fields**

In `src/App.jsx`, in the `useEffect` that reads from the URL hash (~line 470–490), add inside the `if (shared) { ... }` block (after the existing `if (typeof shared.absdRemission === "boolean") setAbsdRemission(shared.absdRemission);` line):

```js
    if (typeof shared.loanType === "string") setLoanType(shared.loanType);
    if (typeof shared.firstTimer === "boolean") setFirstTimer(shared.firstTimer);
    if (typeof shared.flatType === "string") setFlatType(shared.flatType);
    if (typeof shared.proximity === "string") setProximity(shared.proximity);
```

- [ ] **Step 1.6: Remove legacy-key migration code from persistence reader**

In `src/App.jsx`, in the `useEffect` that reads from `localStorage` (~line 505–550), find the block that reads `LEGACY_STORAGE_KEY` and migrates it. It looks like:

```js
        let raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            try {
              JSON.parse(legacy);
              window.localStorage.setItem(STORAGE_KEY, legacy);
              window.localStorage.removeItem(LEGACY_STORAGE_KEY);
              raw = legacy;
            } catch {}
          }
        }
```

Replace it with the simple form:

```js
        const raw = window.localStorage.getItem(STORAGE_KEY);
```

- [ ] **Step 1.7: Wire persistence reader for new fields**

In the same `useEffect`, in the `if (raw) { ... }` block where the existing `setX(s.X)` calls live (~line 535–545), add (after the `setAbsdRemission` line):

```js
          if (typeof s.loanType === "string") setLoanType(s.loanType);
          if (typeof s.firstTimer === "boolean") setFirstTimer(s.firstTimer);
          if (typeof s.flatType === "string") setFlatType(s.flatType);
          if (typeof s.proximity === "string") setProximity(s.proximity);
```

- [ ] **Step 1.8: Wire persistence writer for new fields**

In `src/App.jsx`, find the persistence writer block (~line 575–585). It contains a JSON.stringify of the saved payload. Update it to include the new fields. For example, if it currently looks like:

```js
        STORAGE_KEY,
        JSON.stringify({
          buyerMode,
          age1, income1, age2, income2,
          existingDebt1, existingDebt2, cash1, cash2, cpf1, cpf2,
          tenure, propertyOrder, propertyType, residency1, residency2, stressRate, marketRate, ltvTarget, absdRemission,
        })
```

Add the new fields:

```js
        STORAGE_KEY,
        JSON.stringify({
          buyerMode,
          age1, income1, age2, income2,
          existingDebt1, existingDebt2, cash1, cash2, cpf1, cpf2,
          tenure, propertyOrder, propertyType, residency1, residency2, stressRate, marketRate, ltvTarget, absdRemission,
          loanType, firstTimer, flatType, proximity,
        })
```

Also update the `useEffect` dependency array on the next few lines to include the four new fields.

- [ ] **Step 1.9: Wire reset for new fields**

In `src/App.jsx`, in the `handleReset` function (~line 600–620), add (after the `setAbsdRemission(...)` line):

```js
    setLoanType(FACTORY_DEFAULTS.loanType);
    setFirstTimer(FACTORY_DEFAULTS.firstTimer);
    setFlatType(FACTORY_DEFAULTS.flatType);
    setProximity(FACTORY_DEFAULTS.proximity);
```

- [ ] **Step 1.10: Wire share-link encoder for new fields**

In `src/App.jsx`, find the share-link encoder (~line 635–640). The settings object passed to `encodeShareUrl` should include the new fields. Update it:

```js
    const settings = {
      buyerMode,
      age1, income1, age2, income2,
      existingDebt1, existingDebt2, cash1, cash2, cpf1, cpf2,
      tenure, propertyOrder, stressRate, marketRate, ltvTarget,
      propertyType, buyerMode, residency1, residency2, absdRemission,
      loanType, firstTimer, flatType, proximity,
    };
```

- [ ] **Step 1.11: Smoke-test**

```bash
npm run dev
```

Open `http://localhost:5173/sg-property-affordability/`. Confirm the app loads without errors and shows the existing UI (Condo / Landed selector unchanged at this point). Open DevTools console — no errors. Stop the server.

In DevTools, check `localStorage`: the `private_property_affordability_v1` key may exist from prior use; the new `sg_property_affordability_v2` key only writes when you click Save. That's expected — old key is abandoned per spec.

- [ ] **Step 1.12: Commit**

```bash
git add src/App.jsx
git commit -m "Storage key bump v1→v2; add loanType/firstTimer/flatType/proximity state"
```

---

## Task 2: Create `src/grants.js` pure helper

**Files:**
- Create: `src/grants.js`

A pure module exporting `computeGrants(...)` plus the constants it depends on. No React, no DOM, no side effects. Returns `{ ehg, familyGrant, phg, singlesGrant, total }`.

- [ ] **Step 2.1: Create the file with the EHG tier table**

Create `src/grants.js` with the following content. The EHG tier table values are sourced from the current HDB EHG rate sheet — verify against https://www.hdb.gov.sg/residential/buying-a-flat/understanding-your-eligibility-and-housing-loan-options/cpf-housing-grants/ehg before merge. If the published values have changed, update `EHG_COUPLES_TIERS` accordingly; structure stays the same.

```js
// CPF Housing Grant computation. Pure helpers — no React, no DOM.
//
// Authoritative source for amounts and tiers (verify before merge):
// https://www.hdb.gov.sg/residential/buying-a-flat/understanding-your-eligibility-and-housing-loan-options/cpf-housing-grants

// Enhanced CPF Housing Grant (EHG): tiered by 12-month average gross
// household monthly income, in $500 brackets. Couples first-timer rate.
// Singles get half (rounded down to nearest $500).
//
// Pattern: $120k at the lowest bracket, step down by $5k per $500 income
// bracket, $0 above the cap.
export const EHG_COUPLES_TIERS = [
  { maxIncome: 1500, amount: 120000 },
  { maxIncome: 2000, amount: 115000 },
  { maxIncome: 2500, amount: 110000 },
  { maxIncome: 3000, amount: 105000 },
  { maxIncome: 3500, amount: 100000 },
  { maxIncome: 4000, amount: 95000 },
  { maxIncome: 4500, amount: 90000 },
  { maxIncome: 5000, amount: 85000 },
  { maxIncome: 5500, amount: 80000 },
  { maxIncome: 6000, amount: 75000 },
  { maxIncome: 6500, amount: 70000 },
  { maxIncome: 7000, amount: 65000 },
  { maxIncome: 7500, amount: 60000 },
  { maxIncome: 8000, amount: 55000 },
  { maxIncome: 8500, amount: 50000 },
  { maxIncome: 9000, amount: 45000 },
  { maxIncome: 9500, amount: 40000 },
  // above the last maxIncome → $0
];

// Family Grant (Resale only, first-timer). Couples only — singles use the
// Singles Grant instead.
export const FAMILY_GRANT_AMOUNTS = {
  couple_sc_sc: 80000,
  couple_sc_spr: 40000,
};

// Proximity Housing Grant (Resale only, no first-timer requirement).
// Different amounts for couples vs singles.
export const PHG_AMOUNTS = {
  couples: { with: 30000, within4km: 20000, none: 0 },
  singles: { with: 15000, within4km: 10000, none: 0 },
};

// Singles Grant (Resale only, single SC ≥35, first-timer).
export const SINGLES_GRANT_AMOUNT = 40000;

// BTO income ceilings by flat type, for the eligibility warning. Modelling
// the more permissive non-mature ceiling for 3-room.
export const BTO_INCOME_CEILINGS = {
  "2room": 7000,
  "3room": 14000,
  "4room": 14000,
  "5room": 14000,
  "executive": 14000,
};

const ZERO = { ehg: 0, familyGrant: 0, phg: 0, singlesGrant: 0, total: 0 };

// Classify the household for grant purposes. Returns one of:
//   "couple_sc_sc" | "couple_sc_spr" | "solo_sc" | "ineligible"
export function citizenshipClass({ buyerMode, residency1, residency2 }) {
  if (buyerMode === "solo") {
    return residency1 === "sc" ? "solo_sc" : "ineligible";
  }
  // joint
  const set = [residency1, residency2].sort().join("_"); // e.g. "sc_sc", "sc_spr"
  if (set === "sc_sc") return "couple_sc_sc";
  if (set === "spr_sc" || set === "sc_spr") return "couple_sc_spr";
  return "ineligible";
}

function ehgAmount({ householdMonthlyIncome, isSingles }) {
  const tier = EHG_COUPLES_TIERS.find((t) => householdMonthlyIncome <= t.maxIncome);
  if (!tier) return 0;
  if (isSingles) {
    return Math.floor(tier.amount / 2 / 500) * 500;
  }
  return tier.amount;
}

export function computeGrants({
  propertyType,
  buyerMode,
  residency1,
  residency2,
  age1,
  // age2 unused for grant rules
  householdMonthlyIncome,
  firstTimer,
  proximity,
}) {
  if (propertyType !== "hdb_bto" && propertyType !== "hdb_resale") return ZERO;

  const classType = citizenshipClass({ buyerMode, residency1, residency2 });
  if (classType === "ineligible") return ZERO;

  const isSingles = buyerMode === "solo";
  const isResale = propertyType === "hdb_resale";

  const ehg = firstTimer ? ehgAmount({ householdMonthlyIncome, isSingles }) : 0;

  const familyGrant =
    isResale && firstTimer && !isSingles
      ? (FAMILY_GRANT_AMOUNTS[classType] || 0)
      : 0;

  const phg = isResale
    ? (isSingles ? PHG_AMOUNTS.singles[proximity] : PHG_AMOUNTS.couples[proximity]) || 0
    : 0;

  const singlesGrant =
    isResale && classType === "solo_sc" && age1 >= 35 && firstTimer
      ? SINGLES_GRANT_AMOUNT
      : 0;

  return {
    ehg,
    familyGrant,
    phg,
    singlesGrant,
    total: ehg + familyGrant + phg + singlesGrant,
  };
}
```

- [ ] **Step 2.2: Smoke-test the build picks up the new file**

```bash
npm run dev
```

Confirm the app still loads (the new module is unused at this point — Vite should not complain). Stop the server.

- [ ] **Step 2.3: Commit**

```bash
git add src/grants.js
git commit -m "Add pure grants.js module: EHG/Family/PHG/Singles computation"
```

---

## Task 3: Property type selector + loan type toggle

**Files:**
- Modify: `src/App.jsx` (~line 1230 property type selector, ~line 1273 add loan type toggle below)

Widen the property type selector from 2 to 4 options, and add a loan type toggle that only renders for HDB modes.

- [ ] **Step 3.1: Add `isHdb` derived value in component body**

In `src/App.jsx`, immediately after all the `useState` hooks (~line 460, before the first `useEffect`), add:

```js
  const isHdb = propertyType === "hdb_bto" || propertyType === "hdb_resale";
```

- [ ] **Step 3.2: Widen property type selector to 4 options**

In `src/App.jsx`, in the property type selector block (~line 1230), change the `grid-cols-2` to `grid-cols-2 md:grid-cols-4` and the options array to include the two HDB modes:

```jsx
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                  {[
                    { v: "condo", label: "Condo / Apt" },
                    { v: "landed", label: "Landed" },
                    { v: "hdb_bto", label: "HDB BTO" },
                    { v: "hdb_resale", label: "HDB Resale" },
                  ].map((o) => (
```

- [ ] **Step 3.3: Add loan type toggle below the property type selector**

In `src/App.jsx`, immediately after the closing `</div>` of the property-type block (~line 1273, after the existing landed-disclaimer conditional and the wrapping `<div className="mb-5">`'s close), insert a new conditional block. The full inserted markup:

```jsx
              {isHdb && (
                <div className="mb-5">
                  <div
                    className="text-[11px] uppercase tracking-[0.14em] text-stone-600 mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    Loan Type
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { v: "hdb", label: "HDB Concessionary" },
                      { v: "bank", label: "Bank loan" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        onClick={() => setLoanType(o.v)}
                        className="py-2.5 px-2 text-center transition-colors border"
                        style={{
                          background: loanType === o.v ? "#1B4332" : "#FAF7EE",
                          color: loanType === o.v ? "#FAF7EE" : "#1F2421",
                          borderColor: loanType === o.v ? "#1B4332" : "#D9D2BF",
                        }}
                      >
                        <div className="text-sm font-semibold">{o.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
```

- [ ] **Step 3.4: Smoke-test**

```bash
npm run dev
```

Open `http://localhost:5173/sg-property-affordability/`. Verify:
1. Property type selector shows 4 options.
2. Selecting Condo or Landed: no Loan Type toggle visible.
3. Selecting HDB BTO or HDB Resale: Loan Type toggle appears with HDB Concessionary selected by default.
4. Toggling between the two loan types changes the highlighted button.

Stop the server.

- [ ] **Step 3.5: Commit**

```bash
git add src/App.jsx
git commit -m "UI: extend property type to 4 options; add HDB loan type toggle"
```

---

## Task 4: HDB-specific controls (first-timer, flat type, proximity)

**Files:**
- Modify: `src/App.jsx` (immediately below the loan-type toggle block from Task 3)

Add three HDB-only controls. First-timer is a checkbox; flat type and proximity are select-style button grids matching the existing style. Proximity is rendered only for `hdb_resale`.

- [ ] **Step 4.1: Add the HDB controls block**

In `src/App.jsx`, immediately after the loan-type toggle conditional from Task 3 closes, insert a new conditional block with three sub-controls:

```jsx
              {isHdb && (
                <div className="mb-5 space-y-4">
                  <label className="flex items-start gap-2 text-[12px] text-stone-700 leading-relaxed cursor-pointer">
                    <input
                      type="checkbox"
                      checked={firstTimer}
                      onChange={(e) => setFirstTimer(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span style={{ fontFamily: '"Fraunces", serif', fontStyle: "italic" }}>
                      First-timer household (no prior CPF housing grant or HDB purchase)
                    </span>
                  </label>

                  <div>
                    <div
                      className="text-[11px] uppercase tracking-[0.14em] text-stone-600 mb-2"
                      style={{ fontWeight: 500 }}
                    >
                      Flat Type
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { v: "2room", label: "2-rm" },
                        { v: "3room", label: "3-rm" },
                        { v: "4room", label: "4-rm" },
                        { v: "5room", label: "5-rm" },
                        { v: "executive", label: "Exec" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          onClick={() => setFlatType(o.v)}
                          className="py-2 px-1.5 text-center transition-colors border"
                          style={{
                            background: flatType === o.v ? "#1B4332" : "#FAF7EE",
                            color: flatType === o.v ? "#FAF7EE" : "#1F2421",
                            borderColor: flatType === o.v ? "#1B4332" : "#D9D2BF",
                          }}
                        >
                          <div className="text-xs font-semibold">{o.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {propertyType === "hdb_resale" && (
                    <div>
                      <div
                        className="text-[11px] uppercase tracking-[0.14em] text-stone-600 mb-2"
                        style={{ fontWeight: 500 }}
                      >
                        Proximity to Parents / Married Child
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { v: "with", label: "Living with" },
                          { v: "within4km", label: "Within 4km" },
                          { v: "none", label: "Neither" },
                        ].map((o) => (
                          <button
                            key={o.v}
                            onClick={() => setProximity(o.v)}
                            className="py-2 px-1.5 text-center transition-colors border"
                            style={{
                              background: proximity === o.v ? "#1B4332" : "#FAF7EE",
                              color: proximity === o.v ? "#FAF7EE" : "#1F2421",
                              borderColor: proximity === o.v ? "#1B4332" : "#D9D2BF",
                            }}
                          >
                            <div className="text-xs font-semibold">{o.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
```

- [ ] **Step 4.2: Smoke-test**

```bash
npm run dev
```

Verify:
1. Condo / Landed: no HDB controls visible.
2. HDB BTO: First-timer checkbox + Flat Type grid visible. No Proximity grid.
3. HDB Resale: First-timer + Flat Type + Proximity all visible.
4. Toggling each control updates the highlighted state.

Stop the server.

- [ ] **Step 4.3: Commit**

```bash
git add src/App.jsx
git commit -m "UI: add HDB-specific controls (first-timer, flat type, proximity)"
```

---

## Task 5: Eligibility warnings — generalised eligibility note surface

**Files:**
- Modify: `src/App.jsx` (replace the landed-only conditional block ~line 1249–1272 with a new general eligibility note section)

Replace the landed-disclaimer logic with a function that returns the appropriate warning copy based on `(propertyType, residency1, residency2, buyerMode, age1, totalIncome, flatType)`. Warnings are non-blocking — calc continues regardless.

- [ ] **Step 5.1: Add eligibility helper above the component definition**

In `src/App.jsx`, just before `export default function PrivatePropertyAffordabilityCalculator()` (~line 433), add a helper function. Place it after the icon definitions:

```js
// Returns an array of { tone: "warn" | "info", text } notes for the current
// eligibility state. Empty when nothing applies.
function eligibilityNotes({
  propertyType,
  residency1,
  residency2,
  buyerMode,
  age1,
  totalIncome,
  flatType,
}) {
  const notes = [];
  const isHdb = propertyType === "hdb_bto" || propertyType === "hdb_resale";

  if (propertyType === "landed") {
    if (residency1 !== "sc" || (buyerMode === "joint" && residency2 !== "sc")) {
      notes.push({
        tone: "warn",
        text: "Mainland landed property requires Singapore Citizenship. Calculation continues for reference only.",
      });
    } else {
      notes.push({
        tone: "info",
        text: "Mainland landed property may only be purchased by Singapore Citizens; Sentosa Cove permits PRs subject to LDAU approval.",
      });
    }
  }

  if (isHdb) {
    const r1Foreigner = residency1 === "foreigner";
    const r2Foreigner = buyerMode === "joint" && residency2 === "foreigner";
    if (r1Foreigner || r2Foreigner) {
      notes.push({
        tone: "warn",
        text: "Foreigners cannot buy HDB. Calculation continues for reference only.",
      });
    }
  }

  if (propertyType === "hdb_bto") {
    const hasSc =
      residency1 === "sc" || (buyerMode === "joint" && residency2 === "sc");
    if (!hasSc) {
      notes.push({
        tone: "warn",
        text: "BTO requires at least one Singapore Citizen.",
      });
    }
    if (buyerMode === "solo" && residency1 === "sc" && age1 < 35) {
      notes.push({
        tone: "warn",
        text: "Singles must be ≥35 to apply for BTO.",
      });
    }
    const ceiling =
      flatType === "2room" ? 7000 : 14000; // matches BTO_INCOME_CEILINGS in grants.js
    const monthly = (totalIncome || 0);
    if (monthly > ceiling) {
      notes.push({
        tone: "warn",
        text: `Household income $${monthly.toLocaleString()}/mo exceeds BTO ceiling ($${ceiling.toLocaleString()}) for this flat type.`,
      });
    }
  }

  return notes;
}
```

- [ ] **Step 5.2: Replace the landed-disclaimer JSX block with a general eligibility-notes renderer**

In `src/App.jsx`, find the existing landed-disclaimer block (~line 1249, the `{propertyType === "landed" && (...)}` conditional). Replace the entire block (from the opening `{propertyType === "landed" && (` through its closing `)}`) with:

```jsx
                {(() => {
                  const notes = eligibilityNotes({
                    propertyType,
                    residency1,
                    residency2,
                    buyerMode,
                    age1,
                    totalIncome: income1 + (buyerMode === "joint" ? income2 : 0),
                    flatType,
                  });
                  return notes.map((n, i) => (
                    <p
                      key={i}
                      className="text-[11px] mt-2 px-3 py-2 leading-relaxed"
                      style={
                        n.tone === "warn"
                          ? {
                              background: "rgba(160,76,45,0.08)",
                              color: "#A04C2D",
                              fontFamily: '"Fraunces", serif',
                              fontStyle: "italic",
                            }
                          : {
                              fontFamily: '"Fraunces", serif',
                              fontStyle: "italic",
                              color: "#57534E",
                            }
                      }
                    >
                      {n.tone === "warn" ? "⚠ " : ""}
                      {n.text}
                    </p>
                  ));
                })()}
```

- [ ] **Step 5.3: Smoke-test**

```bash
npm run dev
```

Verify (try each of the following scenarios in the UI):
1. Condo, SC+SC: no warnings.
2. Landed, SC+SC: info note ("Mainland landed property may only be purchased by Singapore Citizens...").
3. Landed, SC+SPR: warn note ("Mainland landed property requires Singapore Citizenship.").
4. HDB BTO, SC+Foreigner: two warn notes (Foreigners cannot buy HDB; BTO requires at least one SC — wait, has SC, so just the foreigner warning).
5. HDB BTO, SPR+SPR: warn ("BTO requires at least one Singapore Citizen.").
6. HDB BTO, Solo SC, age 30: warn ("Singles must be ≥35 to apply for BTO.").
7. HDB BTO, SC+SC, household income $20k, 4-room flat: warn ("Household income $20,000/mo exceeds BTO ceiling ($14,000) for this flat type.").
8. HDB Resale: HDB-specific warnings only fire for foreigner; no BTO ceiling check.

Stop the server.

- [ ] **Step 5.4: Commit**

```bash
git add src/App.jsx
git commit -m "UI: replace landed disclaimer with general eligibility-note surface"
```

---

## Task 6: Calc engine — derive (stressFloor, tenureCap, ltv, ltvReducible, minCash) from (propertyType, loanType)

**Files:**
- Modify: `src/App.jsx` (calc engine block ~line 660–690, tenure input ~line 1295–1308)

Make stress floor, tenure cap, LTV table, LTV-reducibility, and min-cash dependent on `(propertyType, loanType)`. The user's stress rate is taken as a soft override (`max(userStressRate, modeFloor)`); the tenure is clamped (`min(userTenure, modeCap)`) inside the calc only — the user's input value remains untouched in state.

- [ ] **Step 6.1: Add a `loanParams` helper in the same area as `eligibilityNotes`**

In `src/App.jsx`, alongside the `eligibilityNotes` helper added in Task 5, add:

```js
// Derive loan-mode constraints from (propertyType, loanType).
// Used to gate stress-rate floor, tenure cap, LTV table, LTV reducibility,
// and minimum cash requirements.
function loanParams({ propertyType, loanType }) {
  const isHdb = propertyType === "hdb_bto" || propertyType === "hdb_resale";
  if (!isHdb) {
    // Private bank loan (existing behaviour).
    return {
      stressFloor: 4.0,
      tenureCap: 35,
      ltvFirst: 0.75,
      ltvReducedFirst: 0.55,
      ltvSecond: 0.45,
      ltvReducedSecond: 0.25,
      ltvThird: 0.35,
      ltvReducedThird: 0.15,
      ltvReducible: true,
      minCashFirst: 0.05,
      minCashFirstReduced: 0.10,
      minCashOther: 0.25,
    };
  }
  if (loanType === "hdb") {
    // HDB Concessionary Loan: 75% LTV, no age/tenure reduction, 0% min cash,
    // 25-year max tenure, 3% stress floor.
    return {
      stressFloor: 3.0,
      tenureCap: 25,
      ltvFirst: 0.75,
      ltvReducedFirst: 0.75,
      ltvSecond: 0.75,
      ltvReducedSecond: 0.75,
      ltvThird: 0.75,
      ltvReducedThird: 0.75,
      ltvReducible: false,
      minCashFirst: 0.0,
      minCashFirstReduced: 0.0,
      minCashOther: 0.0,
    };
  }
  // HDB bank loan: same LTV table as private (reducible), 5% min cash, 30y cap, 4% floor.
  return {
    stressFloor: 4.0,
    tenureCap: 30,
    ltvFirst: 0.75,
    ltvReducedFirst: 0.55,
    ltvSecond: 0.45,
    ltvReducedSecond: 0.25,
    ltvThird: 0.35,
    ltvReducedThird: 0.15,
    ltvReducible: true,
    minCashFirst: 0.05,
    minCashFirstReduced: 0.05,
    minCashOther: 0.05,
  };
}
```

- [ ] **Step 6.2: Use `loanParams` in the calc engine**

In `src/App.jsx`, in the calc `useMemo` body (~line 660), find the TDSR / LTV section. Replace it as follows.

Replace the existing block (currently ~line 661–687):

```js
    // TDSR
    const tdsrCap = 0.55 * totalIncome;
    const availableForMortgage = Math.max(0, tdsrCap - totalExistingDebt);
    const maxLoanTDSR = maxLoanFromPayment(availableForMortgage, tenure, stressRate / 100);

    // Income-weighted age (MAS guidance for joint borrowers)
    const weightedAge =
      totalIncome > 0
        ? (age1 * income1 + age2Eff * income2Eff) / totalIncome
        : (age1 + age2Eff) / 2;

    const exceedsAge = weightedAge + tenure > 65;
    const exceedsTenure = tenure > 30;
    const reducedLTV = exceedsAge || exceedsTenure;

    // LTV table (MAS, residential property loans from FIs)
    let ltv, minCashPct;
    if (propertyOrder === "first") {
      ltv = reducedLTV ? 0.55 : 0.75;
      minCashPct = reducedLTV ? 0.1 : 0.05;
    } else if (propertyOrder === "second") {
      ltv = reducedLTV ? 0.25 : 0.45;
      minCashPct = 0.25;
    } else {
      ltv = reducedLTV ? 0.15 : 0.35;
      minCashPct = 0.25;
    }
```

With:

```js
    // Loan-mode constraints (private bank | HDB Concessionary | HDB bank).
    const params = loanParams({ propertyType, loanType });
    const effectiveStressRate = Math.max(stressRate, params.stressFloor);
    const effectiveTenure = Math.min(tenure, params.tenureCap);

    // TDSR
    const tdsrCap = 0.55 * totalIncome;
    const availableForMortgageTdsr = Math.max(0, tdsrCap - totalExistingDebt);
    const availableForMortgage = availableForMortgageTdsr; // MSR layered in Task 7
    const maxLoanTDSR = maxLoanFromPayment(availableForMortgage, effectiveTenure, effectiveStressRate / 100);

    // Income-weighted age (MAS guidance for joint borrowers)
    const weightedAge =
      totalIncome > 0
        ? (age1 * income1 + age2Eff * income2Eff) / totalIncome
        : (age1 + age2Eff) / 2;

    // LTV-reducibility: HDB Concessionary never reduces; private bank and HDB
    // bank reduce when age+tenure>65 or tenure>30.
    const exceedsAge = weightedAge + effectiveTenure > 65;
    const exceedsTenure = effectiveTenure > 30;
    const reducedLTV = params.ltvReducible && (exceedsAge || exceedsTenure);

    // LTV table from loan params.
    let ltv, minCashPct;
    if (propertyOrder === "first") {
      ltv = reducedLTV ? params.ltvReducedFirst : params.ltvFirst;
      minCashPct = reducedLTV ? params.minCashFirstReduced : params.minCashFirst;
    } else if (propertyOrder === "second") {
      ltv = reducedLTV ? params.ltvReducedSecond : params.ltvSecond;
      minCashPct = params.minCashOther;
    } else {
      ltv = reducedLTV ? params.ltvReducedThird : params.ltvThird;
      minCashPct = params.minCashOther;
    }
```

- [ ] **Step 6.3: Use `effectiveTenure` and `effectiveStressRate` everywhere in calc that referenced `tenure` / `stressRate`**

In the same `useMemo`, search for remaining usages of `tenure` and `stressRate` (lines ~700–820). Replace `tenure` with `effectiveTenure` and `stressRate` with `effectiveStressRate` in the following spots (these all live inside the calc body):

- The `monthlyPayment(reverseLoan, tenure, stressRate / 100)` call (~line 812) becomes `monthlyPayment(reverseLoan, effectiveTenure, effectiveStressRate / 100)`.
- Any other internal references inside the calc `useMemo` that use `tenure` for cash-flow / payment math should use `effectiveTenure`. (References to `tenure` in the dependency array stay as-is — the input still drives recomputation. References outside the `useMemo`, like the slider UI, also stay as-is.)

Search via:

```bash
grep -n "tenure\|stressRate" src/App.jsx | sed -n '/useMemo\|let lo\|monthlyPayment\|maxLoanFromPayment/p' || true
```

For each match inside the calc useMemo (lines ~660–870), substitute as described. The dependency array (~line 879) and UI bindings keep `tenure` / `stressRate` as-is.

- [ ] **Step 6.4: Add return values for `effectiveTenure` and `effectiveStressRate` from the calc**

In `src/App.jsx`, in the `return { ... }` at the end of the `useMemo` (~line 825–860), add:

```js
      effectiveTenure,
      effectiveStressRate,
      tenureClamped: tenure > params.tenureCap,
      stressRateClamped: stressRate < params.stressFloor,
      tenureCap: params.tenureCap,
      stressFloor: params.stressFloor,
```

- [ ] **Step 6.5: Add clamp note under the tenure input**

In `src/App.jsx`, find the tenure slider block (~line 1294–1308). Immediately after the closing `</div>` of the slider's labels row (the one with `<span>5</span><span>30 (max for top LTV)</span><span>35</span>`), add a clamp note:

```jsx
                {c.tenureClamped && (
                  <p
                    className="text-[10px] italic text-[#A04C2D] mt-1"
                    style={{ fontFamily: '"Fraunces", serif' }}
                  >
                    Capped at {c.tenureCap}y for this loan type.
                  </p>
                )}
```

(Confirm `c` is the calc result variable in this scope — it should be, since other parts of the JSX already reference `c.effectiveLTV` etc. If the scope name differs in your inserted spot, use whichever variable holds the calc result.)

- [ ] **Step 6.6: Update calc-deps array to include `loanType`**

In `src/App.jsx`, find the dependency array for the calc `useMemo` (~line 875–880). Add `loanType` to the list so the calc recomputes when loan type changes:

```js
  }, [
    age1, age2, income1, income2, existingDebt1, existingDebt2,
    cash1, cash2, cpf1, cpf2,
    tenure, propertyOrder, residency1, residency2, stressRate, marketRate, targetOverride, ltvTarget,
    buyerMode, absdRemission, propertyType, loanType,
  ]);
```

(Insert `propertyType` and `loanType` if not already present.)

- [ ] **Step 6.7: Smoke-test**

```bash
npm run dev
```

Verify:
1. Default Condo + Joint + SC+SC: numbers identical to before this task. (Hardcoded baseline: with default inputs, the displayed Max price and breakdown should match what the previous build showed.)
2. Switch to HDB BTO + HDB Concessionary: max tenure clamps at 25y, stress floor at 3%. Tenure clamp note appears if user's tenure was >25.
3. Switch to HDB BTO + Bank loan: max tenure clamps at 30y, stress floor 4%.
4. Switch to Landed: tenure cap 35, stress floor 4% (unchanged).

Stop the server.

- [ ] **Step 6.8: Commit**

```bash
git add src/App.jsx
git commit -m "Calc: derive stress floor, tenure cap, LTV, min cash from (propertyType, loanType)"
```

---

## Task 7: Calc engine — MSR (Mortgage Servicing Ratio) for HDB modes

**Files:**
- Modify: `src/App.jsx` (calc engine block, MSR layering ~line 661, bottleneck classification ~line 745–760)

Add the MSR cap (30% of gross household income) for HDB modes only. When MSR binds, surface it in the bottleneck label.

- [ ] **Step 7.1: Layer MSR onto `availableForMortgage`**

In `src/App.jsx`, in the calc `useMemo` (around the section modified in Task 6.2), update the line that computed `availableForMortgage = availableForMortgageTdsr;` to:

```js
    // MSR (HDB only): 30% of gross household income caps the monthly mortgage.
    const msrCap = isHdb ? 0.30 * totalIncome : Infinity;
    const availableForMortgage = Math.min(availableForMortgageTdsr, msrCap);
    const msrBinds = isHdb && msrCap < availableForMortgageTdsr;
```

(Note: `isHdb` was added in Task 3.1; reference it directly inside the `useMemo`. If JS scoping requires it, recompute inside the calc body: `const isHdb = propertyType === "hdb_bto" || propertyType === "hdb_resale";` at the top of the useMemo.)

- [ ] **Step 7.2: Surface MSR in bottleneck classification**

In `src/App.jsx`, find the bottleneck classification (~line 747–751). Currently:

```js
    let bottleneck;
    if (cashFloorBinds) bottleneck = "cash";
    else if (fundsBinds && incomeAtCapAtMax) bottleneck = "income+funds";
    else if (fundsBinds) bottleneck = "funds";
    else bottleneck = "funds";
```

Replace with (preserves the existing logic exactly, just renames `"income+funds"` to `"msr+funds"` when MSR is the binding income-side constraint):

```js
    let bottleneck;
    if (cashFloorBinds) bottleneck = "cash";
    else if (fundsBinds && incomeAtCapAtMax) bottleneck = msrBinds ? "msr+funds" : "income+funds";
    else if (fundsBinds) bottleneck = "funds";
    else bottleneck = "funds";
```

- [ ] **Step 7.3: Add MSR fields to calc return**

In `src/App.jsx`, in the calc `useMemo`'s return (~line 825–860), add:

```js
      msrBinds,
      msrCap,
```

- [ ] **Step 7.4: Render the new bottleneck labels**

In `src/App.jsx`, search for the existing bottleneck-label rendering (likely near the explanatory copy ~line 1590–1610 — search with `grep -n "bottleneck" src/App.jsx`). Each place that switches on `c.bottleneck` and produces a human label must handle the two new cases. Where the current `income+funds` case lives, also add `msr+funds` and `msr` cases. Example pattern:

Find each switch / lookup that maps `c.bottleneck` to a human label, and add a `"msr+funds"` case with the label `"Limited by MSR + funds"`. Example:

```js
const bottleneckLabel = {
  cash: "Limited by cash on hand",
  funds: "Limited by funds (CPF + cash)",
  "income+funds": "Limited by income + funds",
  "msr+funds": "Limited by MSR + funds",
}[c.bottleneck];
```

If the existing code does inline conditionals on `c.bottleneck`, follow the same pattern, adding `"msr+funds"` branches alongside the existing `"income+funds"` ones. Do not change existing labels.

- [ ] **Step 7.5: Smoke-test**

```bash
npm run dev
```

Verify:
1. Default Condo: MSR not engaged, numbers unchanged.
2. HDB BTO + SC+SC + monthly income $10k + low debts: MSR caps mortgage at $3,000/mo (vs TDSR's $5,500/mo), so max loan and max price drop noticeably. Bottleneck label says "Limited by MSR + funds" instead of "Limited by income + funds" when income/MSR + funds bind.
3. HDB Resale + same setup: MSR cap also applies.
4. Switching back to Condo: MSR releases.

Stop the server.

- [ ] **Step 7.6: Commit**

```bash
git add src/App.jsx
git commit -m "Calc: add MSR cap for HDB modes; surface in bottleneck label"
```

---

## Task 8: Calc engine — ABSD-on-BTO (force zero) + hide property order for BTO

**Files:**
- Modify: `src/App.jsx` (calc engine ~line 690, property order JSX ~line 1391–1438)

For HDB BTO, ABSD is always 0 by eligibility. Hide the property order selector and remission checkbox for BTO mode entirely, and force the calculated `absdRate` to 0.

- [ ] **Step 8.1: Force `absdRate = 0` for HDB BTO in calc**

In `src/App.jsx`, in the calc `useMemo`, find the existing ABSD computation (~line 689–696):

```js
    // ABSD: residency × property-order lookup.
    const absdRate = effectiveAbsdRate({
      buyerMode,
      residency1,
      residency2,
      propertyOrder,
      remission: absdRemission,
    });
```

Replace with:

```js
    // ABSD: HDB BTO eligibility prohibits other property → ABSD = 0 always.
    // All other modes use the residency × property-order lookup.
    const absdRate = propertyType === "hdb_bto"
      ? 0
      : effectiveAbsdRate({
          buyerMode,
          residency1,
          residency2,
          propertyOrder,
          remission: absdRemission,
        });
```

- [ ] **Step 8.2: Hide the property order selector for HDB BTO**

In `src/App.jsx`, find the property-order block (~line 1391, opens with `<div>` containing `Property Order (for ABSD & LTV)`). Wrap the entire block (the outer `<div>` through its matching `</div>`, including the remission checkbox conditional) in a `propertyType !== "hdb_bto" && (...)`:

```jsx
              {propertyType !== "hdb_bto" && (
                <div>
                  {/* existing Property Order block contents */}
                </div>
              )}
```

- [ ] **Step 8.3: Smoke-test**

```bash
npm run dev
```

Verify:
1. HDB BTO mode: Property Order selector hidden. Remission checkbox not shown.
2. HDB BTO: ABSD line in the breakdown shows 0% (or is omitted, depending on existing zero-handling).
3. HDB Resale + 2nd property + SC+SPR: property order selector visible; ABSD computed normally (30% for SPR's 2nd property).
4. HDB Resale + 1st property + SC+SPR: remission checkbox appears; toggling it drops ABSD from 5% (SPR's 1st) to 0% (SC's 1st).
5. Condo / Landed: no change to property order or remission behaviour.

Stop the server.

- [ ] **Step 8.4: Commit**

```bash
git add src/App.jsx
git commit -m "Calc + UI: ABSD=0 for HDB BTO; hide property order selector in BTO mode"
```

---

## Task 9: Calc engine — integrate grants into available CPF

**Files:**
- Modify: `src/App.jsx` (top of file imports, calc engine ~line 650)

Wire `computeGrants` from `src/grants.js`. Treat the grant total as additional CPF (`effectiveCpfOa = userCpfOa + grantTotal`); grants do not offset cash. Pass the grant breakdown through the calc return so the UI can display it.

- [ ] **Step 9.1: Import `computeGrants`**

In `src/App.jsx`, at the top with the other imports (~line 1–4), add:

```js
import { computeGrants } from "./grants";
```

- [ ] **Step 9.2: Compute grants and add to CPF in the calc**

In `src/App.jsx`, inside the calc `useMemo`, immediately after the `cpf1Eff` / `cpf2Eff` derivation (~line 651) but before `totalCPF`, insert:

```js
    const grants = computeGrants({
      propertyType,
      buyerMode,
      residency1,
      residency2,
      age1,
      householdMonthlyIncome: income1 + (buyerMode === "joint" ? income2 : 0),
      firstTimer,
      proximity,
    });
```

Then update `totalCPF` to include the grant total:

```js
    const totalCPF = Math.max(0, cpf1Eff + cpf2Eff + grants.total);
```

- [ ] **Step 9.3: Pass grants through calc return**

In `src/App.jsx`, in the calc `useMemo`'s return object (~line 825–860), add:

```js
      grants,
```

- [ ] **Step 9.4: Update calc-deps array**

In `src/App.jsx`, the calc `useMemo` dependency array (~line 875–880) must include the new state items that affect grants. Make sure these are in the array: `firstTimer`, `flatType`, `proximity`. (LoanType, propertyType were added in Task 6.6.)

```js
  }, [
    age1, age2, income1, income2, existingDebt1, existingDebt2,
    cash1, cash2, cpf1, cpf2,
    tenure, propertyOrder, residency1, residency2, stressRate, marketRate, targetOverride, ltvTarget,
    buyerMode, absdRemission, propertyType, loanType,
    firstTimer, flatType, proximity,
  ]);
```

- [ ] **Step 9.5: Smoke-test**

```bash
npm run dev
```

Verify (open the React DevTools or just observe the Max price changes):
1. Condo / Landed: `c.grants.total` should be 0 (no grants for non-HDB).
2. HDB BTO + SC+SC + first-timer + income1=$2,500, income2=$2,500 (household $5k): `c.grants.ehg = 85000` (tier `maxIncome: 5000`). Total CPF available increases by $85k. Max price increases.
3. HDB Resale + SC+SPR + first-timer + income $2,500 each (household $5k) + Within 4km: EHG $85k + Family Grant $40k + PHG $20k = $145k extra CPF.
4. Toggle first-timer off: EHG and Family Grant zero out, only PHG remains for Resale.
5. HDB BTO + Foreigner buyer: grants = 0 (ineligible).
6. Switch back to Condo: grants = 0, max price returns to non-HDB baseline.

Stop the server.

- [ ] **Step 9.6: Commit**

```bash
git add src/App.jsx
git commit -m "Calc: wire grants into effective CPF (additional bucket, not cash)"
```

---

## Task 10: UI — display grant breakdown in results panel

**Files:**
- Modify: `src/App.jsx` (results panel, near the existing fund-comparison rendering ~line 1700–1730 area; check via `grep -n "Cash downpayment" src/App.jsx`)

Show a small "CPF Housing Grants" sub-section in the breakdown showing the four grant components and total, but only when `c.grants.total > 0`.

- [ ] **Step 10.1: Locate the breakdown rendering area**

Run:

```bash
grep -n "Cash downpayment\|CPF / cash downpayment\|breakdown" src/App.jsx | head -20
```

Note the line numbers of the existing fund-line array (~line 1720). The grant breakdown should render just above or below the existing CPF/cash downpayment lines.

- [ ] **Step 10.2: Insert grants breakdown JSX**

In `src/App.jsx`, immediately after the existing breakdown rows (~line 1730 area, after the closing `</div>` of whatever container holds the row array), insert the new conditional:

```jsx
              {c.grants.total > 0 && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: "#D9D2BF" }}>
                  <div
                    className="text-[11px] uppercase tracking-[0.14em] text-stone-600 mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    CPF Housing Grants
                  </div>
                  <div className="space-y-1 text-[13px]">
                    {[
                      ["EHG (Enhanced CPF Housing Grant)", c.grants.ehg],
                      ["Family Grant", c.grants.familyGrant],
                      ["Proximity Housing Grant", c.grants.phg],
                      ["Singles Grant", c.grants.singlesGrant],
                    ].filter(([, v]) => v > 0).map(([label, v]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-stone-700">{label}</span>
                        <span
                          style={{
                            fontFamily: '"JetBrains Mono", monospace',
                            fontVariantNumeric: "tabular-nums",
                            color: "#1B4332",
                            fontWeight: 600,
                          }}
                        >
                          {fmt(v)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-1 mt-1 border-t" style={{ borderColor: "#D9D2BF" }}>
                      <span className="text-stone-700 font-semibold">Total grants</span>
                      <span
                        style={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontVariantNumeric: "tabular-nums",
                          color: "#1B4332",
                          fontWeight: 700,
                        }}
                      >
                        {fmt(c.grants.total)}
                      </span>
                    </div>
                    <p className="text-[10px] italic text-stone-500 mt-1" style={{ fontFamily: '"Fraunces", serif' }}>
                      Grants are paid into CPF OA at completion and offset CPF requirements (not cash).
                    </p>
                  </div>
                </div>
              )}
```

(If `fmt` is not in scope at this insertion point, look at how nearby breakdown rows format numbers and use the same approach.)

- [ ] **Step 10.3: Smoke-test**

```bash
npm run dev
```

Verify:
1. Condo: no grants section visible.
2. HDB BTO + SC+SC + first-timer + household $5k income: EHG line shows $85,000; Total grants $85,000; explanatory note visible.
3. HDB Resale + SC+SPR + first-timer + household $5k income + Within 4km: EHG $85k, Family Grant $40k, PHG $20k, Total $145k.
4. Toggle first-timer off: EHG and Family rows disappear; only PHG remains.

Stop the server.

- [ ] **Step 10.4: Commit**

```bash
git add src/App.jsx
git commit -m "UI: render CPF Housing Grants breakdown in results panel"
```

---

## Task 11: Branding — title, README, package descriptions

**Files:**
- Modify: `index.html` (title)
- Modify: `src/App.jsx` (hero copy, helper paragraph copy, line ~1000 area)
- Modify: `README.md`
- Modify: `package.json` (description)
- Modify: `package-lock.json` (description, regenerated)

Generalise the public-facing branding from "Private Property" to "Singapore Property" and add an HDB section to the README.

- [ ] **Step 11.1: Update `index.html` title**

```bash
grep -n "Private Property" index.html
```

If a match is present (e.g. `<title>Private Property Affordability · Singapore</title>`), edit it to:

```html
<title>Singapore Property Affordability</title>
```

- [ ] **Step 11.2: Update App.jsx hero / supporting copy**

```bash
grep -n "Private Property\|private residential" src/App.jsx
```

For each match in user-facing copy (the in-app hero header and supporting paragraph ~line 1000), replace "Private Property" with "Singapore Property" and adjust supporting copy to mention HDB:

Example replacement for the hero (~line 998–1003): if the current copy says

> Private Property Affordability — Singapore. Models TDSR, LTV tiers, BSD, ABSD, cash vs CPF, with reverse-calc and shareable defaults.

change to:

> Singapore Property Affordability. Models TDSR, MSR, LTV tiers, BSD, ABSD, CPF Housing Grants, and the cash vs CPF split — for private (Condo / Landed) and HDB (BTO / Resale) purchases.

(Match the existing structure and tone — the goal is one sentence framing the broadened scope.)

- [ ] **Step 11.3: Update README.md**

In `README.md`, change the title and intro:

```markdown
# Singapore Property Affordability

Affordability calculator for Singapore residential property — covers private (condo & landed) and HDB (BTO & resale). Models TDSR, MSR, LTV tiers, BSD, ABSD, CPF deployment and CPF Housing Grants, with a reverse-calc panel and a save/share defaults feature.
```

Then add a new section before the existing "ABSD rates" section (or directly after the "What it models" list — choose whichever flow reads cleanly):

```markdown
## HDB-specific support

Selecting HDB BTO or HDB Resale unlocks HDB-specific mechanics:

### Loan options

| Mode                   | LTV | Age/tenure reduction | Min cash | Stress floor | Max tenure |
|------------------------|-----|----------------------|----------|--------------|------------|
| Private bank           | 75% | yes                  | 5% / 10% | 4%           | 35 yr      |
| HDB bank loan          | 75% | yes                  | 5%       | 4%           | 30 yr      |
| HDB Concessionary loan | 75% | none                 | 0%       | 3%           | 25 yr      |

### MSR

For HDB modes, the Mortgage Servicing Ratio caps the monthly mortgage at 30% of gross household income. This binds before TDSR for typical HDB buyers.

### CPF Housing Grants

The calculator models four grants:

- **Enhanced CPF Housing Grant (EHG)** — BTO + Resale, first-timer; up to $120k for couples, half for singles, scaled by 12-month average gross household income.
- **Family Grant (Resale only)** — $80k for SC+SC couples, $40k for SC+SPR couples, first-timer.
- **Proximity Housing Grant (Resale only)** — $30k (with parents/married child) or $20k (within 4km); singles get half.
- **Singles Grant (Resale only)** — $40k for single SC ≥35, first-timer.

Grants flow into CPF OA at completion and offset CPF requirements (not cash). Authoritative amounts: https://www.hdb.gov.sg/residential/buying-a-flat/understanding-your-eligibility-and-housing-loan-options/cpf-housing-grants — values shown here are as of spec date and may need refreshing.

### Eligibility warnings

Soft warnings (calc continues) fire for:

- Foreigner buyer in HDB mode
- Non-SC-only household for HDB BTO
- Single buyer aged <35 for HDB BTO
- Household income above the BTO ceiling for the chosen flat type
```

- [ ] **Step 11.4: Update `package.json` description**

In `package.json`, change the `description` field to:

```json
  "description": "Singapore property affordability calculator — private (condo, landed) and HDB (BTO, resale)",
```

- [ ] **Step 11.5: Regenerate `package-lock.json` description**

```bash
npm install
```

This rewrites `package-lock.json`'s top-level `description` to match `package.json`. Confirm:

```bash
grep -n "description" package-lock.json | head -3
```

Expected: top `description` line says the new string.

- [ ] **Step 11.6: Smoke-test the rebrand**

```bash
npm run dev
```

Open `http://localhost:5173/sg-property-affordability/`. Verify:
1. Browser tab title says "Singapore Property Affordability".
2. In-app hero says "Singapore Property Affordability" (or your chosen wording).
3. README renders correctly on GitHub (preview locally if you have a markdown viewer, or just eyeball it).

Stop the server.

- [ ] **Step 11.7: Commit**

```bash
git add index.html src/App.jsx README.md package.json package-lock.json
git commit -m "Rebrand to Singapore Property Affordability; document HDB support"
```

---

## Task 12: End-to-end manual verification

**Files:**
- None modified — purely a verification pass against the spec.

Walk through the spec's validation matrix and the eligibility-warning matrix in a single dev-server session. If any scenario produces unexpected numbers or missing warnings, file a follow-up fix as its own commit.

- [ ] **Step 12.1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 12.2: Verify default-load baseline (must match pre-change numbers)**

Inputs: Condo, Joint, SC+SC, age 32 / 32, income $8k / $8k, debts 0, cash $200k / $200k, CPF $100k / $100k, tenure 25, first property.

Confirm: max price and breakdown values match the production app's behaviour for these inputs (check by switching back to the previous build if needed; the private code path should be untouched).

- [ ] **Step 12.3: HDB BTO + HDB Concessionary + first-timer + low income**

Inputs: HDB BTO, Joint, SC+SC, age 30 / 30, income $3k / $3k, debts 0, cash $30k / $30k, CPF $40k / $40k, tenure 25, 4-room flat, first-timer on.

Verify: ABSD = 0; property order selector hidden; max tenure 25 enforced (clamp note appears if tenure was >25); EHG = $75,000 (tier `maxIncome: 6000` for $6k household income); MSR caps mortgage at $1,800/mo; HDB loan 75% LTV; min cash 0%.

- [ ] **Step 12.4: HDB BTO + HDB bank loan**

Same household; switch loan type to "Bank loan".

Verify: max tenure 30; stress floor 4%; min cash 5%; LTV reducible by age/tenure (set tenure 32 → reduced LTV kicks in).

- [ ] **Step 12.5: HDB Resale + SC+SPR + first-timer + with parents**

Inputs: HDB Resale, Joint, SC+SPR, ages 35/35, income $4k each (household $8k), 4-room flat, first-timer on, Living with parents, first property.

Verify: ABSD = SPR's 5% (1st property for SPR); remission checkbox visible (mixed couple, first property); toggling remission drops ABSD to 0%; EHG = $55k (tier `maxIncome: 8000`); Family Grant = $40k (SC+SPR couple); PHG = $30k (with parents). Total grants $125k.

- [ ] **Step 12.6: HDB BTO + Foreigner buyer**

Inputs: HDB BTO, Joint, SC+Foreigner.

Verify: warning fires ("Foreigners cannot buy HDB"). Buyer 2's CPF disabled (existing behaviour). Grants = 0 (ineligible class). Calc still runs.

- [ ] **Step 12.7: HDB BTO + Solo SC + age <35**

Inputs: HDB BTO, Solo, SC, age 30.

Verify: warning fires ("Singles must be ≥35 to apply for BTO"). Calc still runs. Grants = 0 (firstTimer-singles eligibility, but not gated by age — actually only Singles Grant requires age ≥35; EHG for singles still applies if firstTimer). Confirm EHG returns half-rate for solo.

- [ ] **Step 12.8: BTO income ceiling warning**

Inputs: HDB BTO, Joint, SC+SC, income $10k each, 4-room flat.

Verify: warning fires ("Household income $20,000/mo exceeds BTO ceiling ($14,000) for this flat type."). Calc still runs.

- [ ] **Step 12.9: Persistence**

Click "Save defaults" with HDB Resale + SC+SPR + first-timer + with parents. Reload the page.

Verify: state restored exactly. Open DevTools → Application → Local Storage; confirm `sg_property_affordability_v2` key exists with all four new fields.

- [ ] **Step 12.10: Shareable link**

Set up an interesting HDB scenario, click "Share link", paste into a new browser tab.

Verify: state matches. URL hash is cleared after load.

- [ ] **Step 12.11: Stop the dev server**

- [ ] **Step 12.12: If any scenario revealed a bug, fix and commit**

```bash
git add -A
git commit -m "Fix: <describe the issue and fix>"
```

If everything passed, no commit needed.

---

## Self-Review Checklist (for the engineer running this plan)

- [ ] All tasks committed individually.
- [ ] `npm run dev` starts cleanly with no console errors at the end.
- [ ] Default Condo baseline numbers match the pre-change build.
- [ ] All eight verification scenarios in Task 12 pass.
- [ ] No `LEGACY_STORAGE_KEY` references remain in `src/App.jsx` (`grep -n LEGACY src/App.jsx` returns nothing).
- [ ] EHG tier table values in `src/grants.js` have been verified against the HDB EHG page (or a comment explicitly notes the verification date).
