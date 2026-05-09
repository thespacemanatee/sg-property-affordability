# Generalise to all Singapore private property — design

Status: approved (2026-05-09)

## Goal

Today the app frames itself as a "landed property" calculator and hard-codes the
"both-Singapore-Citizen, married couple" ABSD ladder (0% / 20% / 30%). The
underlying TDSR / LTV / BSD math already applies uniformly to all private
residential property, so the gap is in inputs, branding, and the ABSD table.

Generalise the calculator so it correctly models any Singapore private
residential purchase (condo or landed) by any combination of buyers (Solo or
Joint, each SC / SPR / Foreigner), including mixed-couple ABSD remission for a
first matrimonial home.

Out of scope: entity/trust buyers, HDB-specific rules (MSR, MOP, HDB LTV),
and free-trade-agreement nationals treated as SC for ABSD.

## Inputs and UI

Top of page gets a selector strip with two new controls:

- **Property type**: `Condo` (default) | `Landed`
- **Buyer mode**: `Solo` | `Joint` (default)

Each active buyer card gets a **Residency** dropdown: `SC` | `SPR` | `Foreigner`.

Below the property-order / ABSD area, a conditional checkbox: **"First
matrimonial home — apply mixed-couple ABSD remission"**. Only rendered when the
state is eligible (joint mode, mixed residency including ≥1 SC, property order
= `first`); hidden otherwise.

In Solo mode, Buyer 2's income / age / CPF fields are hidden entirely and
treated as zero in the calc.

The existing landed disclaimer (current line ~1529) moves to a small note
under the Property type selector and only renders when Property type =
`Landed`. When Landed is selected and any active buyer is non-SC, the note
escalates from informational ("Mainland landed property may only be purchased
by Singapore Citizens") to a soft warning, but does not block computation —
this matches the rest of the app's "calculate first, surface caveats" posture.

## Calc engine changes

ABSD becomes a residency × property-order lookup instead of a hard-coded
ladder:

| Residency  | 1st  | 2nd  | 3rd+ |
|------------|------|------|------|
| SC         | 0%   | 20%  | 30%  |
| SPR        | 5%   | 30%  | 35%  |
| Foreigner  | 60%  | 60%  | 60%  |

Selection rules:

- **Solo**: that buyer's rate from the table.
- **Joint**: the higher of the two buyers' rates (Singapore default rule —
  joint purchase pays at the highest applicable rate).
- **Remission applied** (checkbox on, eligibility predicate true): use the
  SC rate at the chosen property order. Eligibility predicate: joint mode AND
  property order = `first` AND ≥1 SC buyer AND mixed residency (the other
  buyer is SPR or Foreigner). The remission box has no effect when ineligible
  (it is not even rendered).

CPF inputs are gated on residency: when a buyer's residency = Foreigner, that
buyer's CPF OA input is disabled (rendered greyed-out with helper text
"Foreigners cannot use CPF") and forced to zero in the calc. Switching back
to SC/SPR re-enables the input and restores the previously entered value.

Everything else is residency-agnostic and stays untouched: TDSR cap (55%),
MAS stress floor (4%), LTV tiers (75% → 55% by income-weighted age + tenure),
BSD ladder (1–6%), minimum cash (5%), cash-vs-CPF deployment, and the
reverse-calc / bottleneck logic.

The `bottleneck` cases (`income+funds`, `cash`, `funds`) and corresponding
labels remain unchanged.

## State and storage

New React state:

- `propertyType: "condo" | "landed"`
- `buyerMode: "solo" | "joint"`
- `residency1: "sc" | "spr" | "foreigner"`
- `residency2: "sc" | "spr" | "foreigner"`
- `absdRemission: boolean`

Defaults: `condo`, `joint`, both `sc`, remission `false` — preserving the
current calculation as the default-on-load baseline.

Storage:

- Key bumps from `landed_affordability_defaults_v1` →
  `private_property_affordability_v1`.
- On first mount, if the new key is absent and the old key is present, read
  the old key, merge into the new shape (defaulting the new fields), write
  the new key, and remove the old key. After that the old key is never read.
- Saved fields expand to include the five new state items above, plus an
  override: when a buyer is Foreigner, their persisted CPF value is stored
  as zero (consistent with the runtime gate).

## Shareable link

Users can copy a link that encodes their current settings, so a recipient
opening the link sees the same scenario without having to re-enter inputs.

- Encoding: hash fragment with a single base64-encoded JSON blob —
  `#s=<base64(JSON.stringify(settings))>`. Hash fragments are never sent to
  origin servers, which matters because the payload includes income, CPF,
  and cash figures.
- Payload: the same field set persisted by Save defaults — every input that
  affects the calc, including the five new fields from this spec
  (`propertyType`, `buyerMode`, `residency1`, `residency2`, `absdRemission`).
  `targetOverride` is excluded (it's exploration state, not configuration).
- UI: a "Share link" button in the existing persistence toolbar (next to
  Save / Reset). Click → build URL → write to clipboard via
  `navigator.clipboard.writeText` → show "✓ Link copied" status alongside
  the existing Saved / Reset feedback.
- Load behaviour: on mount, before the localStorage load, check for an `s=`
  hash param. If present and parseable, apply it to state and rewrite the
  URL via `history.replaceState` to drop the hash (cleaner UI, prevents
  accidentally re-sharing the same link with edited values). If absent or
  corrupt, fall through to the existing localStorage → factory chain.
- Precedence at mount: shared link > localStorage > factory.
- Bad payloads (corrupt base64, invalid JSON, missing fields) fail silently
  to the next layer in the precedence chain — never blocks the app.

## Branding

- App title: "Landed Property Affordability · Singapore" → "Private Property
  Affordability · Singapore".
- Hero copy ("Landed Property" header) and supporting prose updated to drop
  the landed-only framing.
- Component name: `LandedAffordabilityCalculator` →
  `PrivatePropertyAffordabilityCalculator`.
- `package.json` `name` → `sg-property-affordability`, description updated.
- `package-lock.json` `name` field updated to match (top level + nested).
- README rewritten to describe a private-property scope, with the ABSD table
  above and a brief note on remission and the Foreigner CPF gate.

## Repo rename follow-through

The GitHub repo has been renamed to `sg-property-affordability`. All
in-repo references to the old name must be updated as part of this change:

- `vite.config.js` → `base: "/sg-property-affordability/"`.
- `README.md` → local dev URL, repo URL examples, and the live Pages URL
  (`https://thespacemanatee.github.io/sg-property-affordability/`).
- `package.json` and `package-lock.json` `name` fields.
- The local working-directory path is still `sg-landed-affordability`, but
  that is environmental, not in-repo, and is not touched by this change.

After this change, no committed file references the old name. GitHub's
automatic redirect handles existing clones and the previous Pages URL.

## Validation and edge cases

- **Both Foreigner, Joint, first property**: ABSD = 60%, no CPF available,
  remission checkbox not rendered. Calc still runs; result is realistic
  (cash-only downpayment, very high ABSD).
- **SC + Foreigner, Joint, first matrimonial, remission on**: ABSD drops
  from 60% to 0% (SC rate at first). CPF available only for the SC buyer.
- **SC + SPR, Joint, second property, remission on**: ABSD drops from 30%
  (SPR's 2nd-property rate) to 20% (SC's 2nd-property rate). Remission
  predicate currently requires `first` — this case does not get remission
  in v1; remission for second matrimonial home edge cases is out of scope.
- **Landed + any non-SC buyer**: warning rendered, calc proceeds.
- **Solo + property order = third**: existing 3rd-property ABSD applies for
  that buyer's residency; remission never applies (solo).
- **Shared-link load**: corrupt payload → app loads with localStorage or
  factory values; URL hash is left intact for the user to inspect. Valid
  payload → state populated, hash cleared.

## Testing approach

The repo has no test runner today. Verification for this change is manual,
exercised through the dev server:

1. Default load matches the pre-change baseline (Joint / SC+SC / Condo /
   first / no remission) — same numbers as before for the same inputs.
2. Switch to Solo: Buyer 2 fields disappear, calc uses Buyer 1 only.
3. Set Buyer 2 to Foreigner: ABSD jumps to 60%, Buyer 2 CPF disabled.
4. Toggle remission on (mixed couple, first property): ABSD drops to SC
   rate. Toggle off: returns to higher rate.
5. Switch to Landed with a non-SC buyer: warning appears under the
   selector. Calc still runs.
6. Save defaults, reload: all new fields persist. Verify old-key migration
   by seeding `localStorage` with the old key only and reloading.

If we add a test runner later, the calc engine in `App.jsx` should be
extracted to a pure module and unit-tested against a matrix of
(residency × order × remission × mode) cases. Not in scope for this change.

## Risks

- **Behaviour drift on default load.** The current production calc must
  remain identical for the default profile. Mitigation: the engine takes a
  derived `absdRate` value the same way it does today — only the source of
  that value changes.
- **Storage migration corruption.** A bad migration could wipe a user's
  saved defaults. Mitigation: only migrate when the new key is absent and
  the old key parses cleanly; on parse failure, fall through to factory
  defaults and leave the old key intact.
- **UI regressions in the input panel.** Adding two top selectors plus a
  residency field per buyer card is the densest UI change. Mitigation:
  manual visual check on desktop and mobile widths before merge.
