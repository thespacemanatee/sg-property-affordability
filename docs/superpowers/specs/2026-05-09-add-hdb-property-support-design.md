# Add HDB property support — design

Status: approved (2026-05-09)

## Goal

Today the calculator covers Singapore private residential property (Condo and
Landed) but explicitly excludes HDB. Most Singapore households buy HDB, and
the gap leaves a large share of users without a tool. Extend the calculator
to cover HDB BTO and HDB Resale alongside the existing private modes,
including the HDB-specific mechanics that change affordability materially:
MSR, the HDB Concessionary Loan, and CPF Housing Grants.

The calc engine, eligibility surfacing posture (calculate first, warn after),
and reverse-calc behaviour all stay; HDB simply layers new constraints onto
the existing pipeline.

Out of scope: Executive Condos (EC), trust/entity buyers, resale levy on
second-time buyers, MOP-based eligibility for buying private after HDB,
free-trade-agreement nationals treated as SC for ABSD, COV (cash-over-
valuation) modelling, and any test runner / unit testing infrastructure.

## Approach

Property type becomes a first-class fork from `Condo | Landed` to
`Condo | Landed | HDB BTO | HDB Resale`. HDB-specific controls (loan type,
first-timer status, flat type, proximity) appear conditionally only when an
HDB option is selected. The calc engine is parameterised by
`(propertyType, loanType)` and routes constraints accordingly. The private
code path is untouched.

## Inputs and UI

Property type selector extends to four options:

- `Condo` (default) | `Landed` | `HDB BTO` | `HDB Resale`

Loan type toggle, rendered only when an HDB option is selected:

- `HDB Concessionary` (default) | `Bank loan`

HDB-specific controls, rendered only for HDB modes:

- **First-timer household** — checkbox, default on. Drives EHG and Family
  Grant eligibility. Defined as: no buyer in the household has previously
  taken a CPF housing grant or bought from HDB.
- **Flat type** — `2-room Flexi | 3-room | 4-room | 5-room | Executive`,
  default `4-room`. Drives Family Grant amount tiering and the BTO income
  ceiling check.
- **Proximity to parents/married child** (Resale only) — `Living with |
  Within 4km | Neither`, default `Neither`. Drives PHG.

Property order selector is hidden for HDB BTO (ABSD always zero by
eligibility). It stays for HDB Resale and private modes.

Buyer cards' Residency dropdown is unchanged. The existing landed
disclaimer surface generalises into a "property eligibility note" surface
that picks the right copy per state:

- Landed + non-SC buyer → "Mainland landed property requires Singapore
  Citizenship".
- HDB + Foreigner buyer → "Foreigners cannot buy HDB".
- HDB BTO + Solo + age <35 → "Singles must be ≥35 to apply for BTO".
- HDB BTO + household income > flat-type ceiling → "Household income
  exceeds BTO ceiling for this flat type".
- HDB BTO + non-SC-only household → "BTO requires at least one Singapore
  Citizen".

All warnings are non-blocking — calc still runs.

## Calc engine changes

The engine becomes parameterised by `(propertyType, loanType)`. Three new
constraints layer onto the existing TDSR / LTV / BSD / ABSD pipeline.

### MSR (Mortgage Servicing Ratio)

Applies for HDB modes only.

- 30% of gross monthly household income caps the monthly mortgage payment.
- `availableForMortgage = isHdb ? min(0.55 × gross − otherDebts, 0.30 × gross) : 0.55 × gross − otherDebts`
- For typical HDB buyers MSR is the binding constraint (TDSR only bites
  when other debts are very high).
- When MSR limits the loan, the bottleneck label surfaces it ("Limited by
  MSR" rather than "Limited by income/TDSR").

### Stress floor and tenure cap

Derived from `(propertyType, loanType)`:

| Mode                       | Stress floor | Max tenure |
|----------------------------|--------------|------------|
| Private bank (Condo/Landed)| 4%           | 35 yr      |
| HDB bank loan              | 4%           | 30 yr      |
| HDB Concessionary loan     | 3%           | 25 yr      |

The user's `stressRate` input becomes a soft override: the engine uses
`max(userStressRate, modeFloor)`. The user's `tenure` input is clamped to
`min(userTenure, modeCap)`; the user's input value is left intact in state,
and a small note appears under the tenure input when clamped ("Capped at
25y for HDB Concessionary loan").

### LTV and minimum cash

Switches by loan type:

| Mode                    | LTV         | Age/tenure reduction | Min cash |
|-------------------------|-------------|----------------------|----------|
| Private bank            | 75%         | yes (existing tiers) | 5% / 10% |
| HDB bank loan           | 75%         | yes (existing tiers) | 5%       |
| HDB Concessionary loan  | 75%         | none                 | 0%       |

For HDB Concessionary, `minCashPct = 0` means the downpayment can be
entirely CPF if available.

### ABSD

- HDB BTO: `absdRate = 0` always. Property order hidden, remission checkbox
  not rendered.
- HDB Resale: residency × property-order lookup, same as private. Remission
  checkbox available with the same predicate.

### BSD and mortgage stamp

Unchanged. Same ladder (1–6%) applies to all modes including HDB.

### CPF Housing Grants

Grants are paid into CPF OA at completion. The engine treats them as
additional CPF: `effectiveCpfOa = userCpfOa + grantTotal`. The grant total
is computed by a pure helper (Section 3) and offsets the CPF requirement
before the existing cash-vs-CPF deployment logic runs. Grants do not offset
cash — they are not cash.

Everything else (income-weighted age, cash-vs-CPF deployment order,
reverse-calc, bottleneck classification) stays untouched.

## Grant calculator

A pure helper extracted to `src/grants.js`:

```
computeGrants({
  propertyType,         // "hdb_bto" | "hdb_resale" | (anything else → 0)
  flatType,             // "2room" | "3room" | "4room" | "5room" | "executive"
  buyerMode,            // "solo" | "joint"
  residency1, residency2,
  age1, age2,
  householdMonthlyIncome,
  firstTimer,
  proximity,            // "with" | "within4km" | "none"
}) → { ehg, familyGrant, phg, singlesGrant, total }
```

### Eligibility frame

- Singles vs couples: `Solo` → singles rate, `Joint` → couples rate.
- HDB eligibility (gates the entire grant calc to 0 when failing):
  - `SC + SC`, `SC + SPR`, `Solo SC` → eligible.
  - `SC + Foreigner` → treated as ineligible in v1 (the Non-Citizen
    Spouse Scheme exists but is niche and out of scope); warning fires,
    grants = 0.
  - `SPR-only`, `Foreigner-only`, `Solo SPR` → ineligible; warning fires,
    grants = 0.
- The citizenship class only affects grant amounts in two places:
  - **Family Grant** differs by SC+SC ($80k) vs SC+SPR ($40k).
  - **EHG, PHG, Singles Grant** are the same regardless of whether the
    eligible household is SC+SC or SC+SPR; only couples-vs-singles split
    matters for those.

### Enhanced CPF Housing Grant (EHG)

BTO and Resale, first-timer only.

- Tier table `EHG_COUPLES_TIERS` keyed on 12-month average gross household
  monthly income, in $500 brackets from $0 up to the cap. Couples rate
  starts at $120k for the lowest bracket, steps down by $5k per $500
  bracket, and zeroes out above the cap.
- Singles rate: `floor(couplesAmount / 2 / 500) × 500`.
- Returns 0 for non-first-timer, non-eligible citizenship class, or income
  above cap.
- The tier table is sourced from the current HDB EHG rate sheet at
  implementation time, with a comment in `grants.js` linking the HDB EHG
  page so future updates are cheap.

### Family Grant (Resale only, first-timer)

- `SC + SC` couple: $80k
- `SC + SPR` couple: $40k
- Singles: not applicable (use Singles Grant instead).
- Returns 0 for BTO, non-first-timer, ineligible citizenship class, or solo
  mode.

### Proximity Housing Grant (Resale only, no first-timer requirement)

- Couples: $30k (with parents/married child) | $20k (within 4km) | $0
- Singles: $15k | $10k | $0
- Returns 0 for BTO.

### Singles Grant (Resale only, single SC ≥35, first-timer)

- Single SC: $40k (half of $80k Family Grant).
- Returns 0 for BTO, joint mode, non-SC, age <35, or non-first-timer.

### BTO income ceiling (used for warning, not the grant calc)

- `2-room Flexi`: $7,000
- `3-room`: $14,000 (modelling the more permissive non-mature cap)
- `4-room | 5-room | Executive`: $14,000

The exact dollar amounts and tier tables are confirmed against the HDB
grants page during implementation.

## State and storage

New React state:

- `loanType: "hdb" | "bank"` — meaningful only for HDB modes; ignored
  otherwise. Default `hdb`.
- `firstTimer: boolean` — default `true`.
- `flatType: "2room" | "3room" | "4room" | "5room" | "executive"` —
  default `4room`.
- `proximity: "with" | "within4km" | "none"` — default `none`.

The existing `propertyType` enum widens to include `"hdb_bto"` and
`"hdb_resale"`. All other state stays as-is.

Derived (not stored):

- `isHdb = propertyType === "hdb_bto" || propertyType === "hdb_resale"`
- `effectiveStressFloor`, `effectiveTenureCap`, `effectiveMinCash`,
  `effectiveLtv`, `effectiveLtvReducible` — derived from
  `(propertyType, loanType)` per the table in the calc-engine section.

### Storage

- Storage key bumps from `private_property_affordability_v1` →
  `sg_property_affordability_v2`.
- No migration. v1 entries are abandoned. Users re-save defaults under v2.
- Saved fields expand to include the four new state items above.

### Shareable link

- Hash payload (`#s=<base64(JSON)>`) gains the four new fields.
- Old links missing HDB fields fall back to factory defaults via the
  existing per-field `typeof` guards. (This is defensive parsing, not a
  migration; it is the existing pattern.)
- Precedence at mount unchanged: shared link > localStorage > factory.

### Foreigner CPF gate

Stays as-is. For HDB modes with a Foreigner buyer, the eligibility warning
surfaces but CPF is already zeroed by the existing residency gate, so no
additional logic is needed.

## Branding

- App title and hero copy generalise from "Private Property Affordability"
  to "Singapore Property Affordability". Updated in `index.html`, the
  in-app header, README, and `package.json` / `package-lock.json`
  descriptions.
- README gains an HDB section: property types supported, MSR explanation,
  loan-type comparison table, grants summary with link to the HDB page,
  and the eligibility warning matrix.
- Component name stays `PrivatePropertyAffordabilityCalculator` — renaming
  is high-blast-radius for low value. A one-line comment notes it now
  covers HDB too.

## Validation and edge cases

- **Default load (Condo, Joint, SC+SC, first)**: identical numbers to the
  pre-change baseline.
- **HDB BTO + SC+SC + HDB loan + first-timer + low income**: MSR binds,
  EHG fires, ABSD = 0, property order hidden, downpayment can be 100% CPF.
- **HDB BTO + SC+SC + bank loan**: bank-loan stress floor (4%) and tenure
  cap (30y) kick in; LTV reducible by age/tenure.
- **HDB Resale + SC+SPR + bank loan + first-timer + with parents**: Family
  Grant ($40k) + EHG (income-tiered) + PHG ($30k) all apply; ABSD on second
  property uses SPR rate; remission predicate available.
- **HDB BTO + Foreigner buyer**: eligibility warning fires; calc still
  runs.
- **HDB BTO + Solo + age <35**: singles BTO age warning fires.
- **HDB BTO + household income $15k + 4-room**: BTO income ceiling warning
  fires.
- **Tenure clamped**: when user's tenure exceeds mode cap, calc uses the
  cap and a small note appears under the tenure input.
- **Stress floor floor**: when user's stress rate is below mode floor,
  calc uses the floor; existing input behaviour is preserved.
- **Shared link from old version**: HDB fields default to factory; loads
  cleanly.

## Testing approach

The repo has no test runner. Verification is manual via the dev server:

1. Default Condo load matches pre-change numbers.
2. Switch to HDB BTO: HDB controls appear, property order disappears,
   ABSD goes to 0, MSR engages.
3. Toggle loan type: stress floor, tenure cap, min cash all update.
4. Set first-timer + low income: EHG amount appears in grant breakdown.
5. Switch to HDB Resale + SC+SPR + with parents: Family Grant + EHG + PHG
   all appear in the breakdown.
6. Save defaults, reload: HDB fields persist.
7. Eligibility warnings fire for: foreigner-on-HDB, single-under-35-BTO,
   income-over-ceiling, non-SC-only-BTO.

If a test runner is added later, the calc engine and grant calculator
should extract to pure modules and be unit-tested against a matrix of
(propertyType × loanType × residency × order × first-timer × proximity)
cases. Not in scope for this change.

## Risks

- **Default-load drift.** Existing private-mode users must see identical
  numbers. Mitigation: HDB-only branches gate on `isHdb`; the private code
  path is untouched.
- **MSR / TDSR interaction bug.** Easy to apply the wrong cap. Mitigation:
  explicit `availableForMortgage = isHdb ? min(tdsrCap, msrCap) : tdsrCap`,
  with the binding constraint surfaced in the bottleneck label when MSR
  limits.
- **Grant value drift.** HDB amounts and tiers change. Mitigation: extract
  grant tables to a `grants.js` module with HDB-page links in comments;
  flag in README that values are as-of-spec-date.
- **UI density.** The input panel grows. Mitigation: HDB controls are
  conditional, so private-mode users see no extra clutter.
- **Loan-type switching mid-calc.** Switching loan type changes the tenure
  cap, which may silently shorten the user's effective tenure. Mitigation:
  clamp on read, leave the user's input value intact, show a clamp note.
