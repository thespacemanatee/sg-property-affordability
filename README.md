# Private Property Affordability · Singapore

Affordability calculator for Singapore private property (condo & landed) — models TDSR, LTV tiers, BSD, ABSD, cash vs CPF deployment, with a reverse-calc panel and a save/share defaults feature.

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
