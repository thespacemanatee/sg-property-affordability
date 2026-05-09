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
  if (set === "sc_spr") return "couple_sc_spr";
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
