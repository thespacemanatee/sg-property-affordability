# Singapore Property Affordability

Affordability calculator for Singapore residential property — covers private (condo & landed) and HDB (BTO & resale). Models TDSR, MSR, LTV tiers, BSD, ABSD, CPF deployment and CPF Housing Grants, with a reverse-calc panel and a save/share defaults feature.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173/sg-property-affordability/

## Deploy to GitHub Pages

This repo is wired up to deploy automatically via GitHub Actions whenever you push to `main`. One-time setup:

### 1. Create the repo on GitHub

Create a new public repository under your account named **`sg-property-affordability`** (or any other name — see step 4 if you change it). Don't initialize it with README/license/gitignore.

### 2. Push this code

From the project directory:

```bash
git init
git add -A
git commit -m "Initial commit: Singapore private property affordability calculator"
git branch -M main
git remote add origin git@github.com:thespacemanatee/sg-property-affordability.git
git push -u origin main
```

(Use the HTTPS URL `https://github.com/thespacemanatee/sg-property-affordability.git` if you don't have SSH set up.)

### 3. Enable GitHub Pages

1. On the repo, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

That's it. The workflow in `.github/workflows/deploy.yml` will build with Vite and publish the `dist/` folder to Pages. The first deploy takes ~30s after the push completes.

Your site will be live at **https://thespacemanatee.github.io/sg-property-affordability/**

### 4. Using a different repo name

If you renamed the repo, update **two** places to match:

- `vite.config.js` → `base: "/your-repo-name/"`
- The README URLs above

For a user-page site (URL = `https://thespacemanatee.github.io/`), name the repo `thespacemanatee.github.io` and set `base: "/"` in `vite.config.js`.

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

## ABSD rates

| Residency  | 1st  | 2nd  | 3rd+ |
|------------|------|------|------|
| SC         | 0%   | 20%  | 30%  |
| SPR        | 5%   | 30%  | 35%  |
| Foreigner  | 60%  | 60%  | 60%  |

Joint purchases pay at the higher applicable rate; mixed-couple first-matrimonial-home remission applies the SC rate via the in-app checkbox.

## Stack

- React 18 + Vite 5
- Tailwind CSS 3 (JIT, arbitrary values like `bg-[#FAF7EE]`)
- Google Fonts: Fraunces, DM Sans, JetBrains Mono
- `localStorage` for the "save as defaults" feature
- No backend — entirely client-side

## What it models

- **TDSR** capped at 55% with 4% MAS stress floor
- **LTV** tiered (75% → 55%) by income-weighted age + tenure rules
- **BSD** 1% / 2% / 3% / 4% / 5% / 6% (post-Feb 2023)
- **ABSD** post-Apr 2023 rates per the table above; Solo/Joint buyer mode with per-buyer residency mix and ABSD remission checkbox for first matrimonial home
- **Solo/Joint mode** — toggle between single buyer and joint purchase; each buyer's residency (SC / SPR / Foreigner) is configured separately
- **ABSD remission** — first-matrimonial-home checkbox for a mixed-residency couple (SC + non-SC) applies the SC rate
- **Auto-loan-optimization** — when income caps the loan below 75% LTV, cash & CPF substitute for the missing borrowing capacity, extending the maximum price beyond the simple `loan / ltv` cap.
- **CPF-first deployment** for flexible portion (cpf-flex over cash-flex)
- **Reverse calculation** that switches between modes:
  - Below max: shows actual deployment (no phantom shortfalls)
  - Above max: shows what's needed to leverage to max LTV (income surfaces first)
- **Shareable link** — copies current inputs to a URL hash fragment (kept off origin servers since the payload contains income / CPF figures) for easy sharing

### Notes

- Mainland landed property (terrace, semi-D, bungalow) requires Singapore Citizenship; Sentosa Cove permits PRs subject to LDAU approval.
- Foreigners cannot use CPF for property purchases (CPF fields are disabled when a Foreigner buyer is selected).

Not financial advice.
