import React, { useState, useMemo, useRef, useEffect } from "react";

// ----- Calculation helpers -----

const calculateBSD = (price) => {
  if (price <= 0) return 0;
  const tiers = [
    { limit: 180000, rate: 0.01 },
    { limit: 180000, rate: 0.02 },
    { limit: 640000, rate: 0.03 },
    { limit: 500000, rate: 0.04 },
    { limit: 1500000, rate: 0.05 },
    { limit: Infinity, rate: 0.06 },
  ];
  let bsd = 0;
  let remaining = price;
  for (const t of tiers) {
    const taxable = Math.min(remaining, t.limit);
    bsd += taxable * t.rate;
    remaining -= taxable;
    if (remaining <= 0) break;
  }
  return bsd;
};

const monthlyPayment = (loan, years, annualRate) => {
  if (loan <= 0 || years <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return loan / n;
  return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
};

const maxLoanFromPayment = (payment, years, annualRate) => {
  if (payment <= 0 || years <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return payment * n;
  return (payment * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n));
};

const fmt = (n) => {
  if (!isFinite(n) || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
};

const fmtCompact = (n) => {
  if (!isFinite(n) || isNaN(n) || n === 0) return "S$0";
  if (n >= 1_000_000) return `S$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `S$${(n / 1_000).toFixed(0)}K`;
  return `S$${Math.round(n)}`;
};

// ----- Reusable input -----

// Format a number/string with thousand separators, preserving an in-progress
// decimal portion (e.g. "3." or "3.20" while the user is still typing).
const formatWithCommas = (val, decimal) => {
  if (val === "" || val === null || val === undefined) return "";
  const str = String(val);
  if (decimal) {
    const [intPart, decPart] = str.split(".");
    const intClean = (intPart || "").replace(/[^\d]/g, "");
    const intF = intClean === "" ? "" : Number(intClean).toLocaleString("en-US");
    if (decPart !== undefined) return `${intF === "" ? "0" : intF}.${decPart}`;
    return intF;
  }
  const cleaned = str.replace(/[^\d]/g, "");
  return cleaned === "" ? "" : Number(cleaned).toLocaleString("en-US");
};

const NumberInput = ({ label, value, onChange, prefix, suffix, hint, decimal = false, disabled = false }) => {
  // `draft` is the live string while focused. null means not editing — use external `value`.
  const [draft, setDraft] = useState(null);
  const inputRef = useRef(null);
  const pendingCursor = useRef(null);
  const meaningful = decimal ? /[\d.]/ : /\d/;

  // After re-render, restore cursor position to where we calculated it should go
  // (cursor naturally jumps when commas are inserted/removed by reformatting).
  useEffect(() => {
    if (pendingCursor.current !== null && inputRef.current) {
      const pos = pendingCursor.current;
      inputRef.current.setSelectionRange(pos, pos);
      pendingCursor.current = null;
    }
  });

  const display = draft !== null ? draft : formatWithCommas(value, decimal);

  const handleChange = (e) => {
    const input = e.target;
    const oldVal = input.value;
    const oldCursor = input.selectionStart ?? oldVal.length;

    // Count meaningful (digit / dot) chars left of the cursor in the raw input.
    let charsLeft = 0;
    for (let i = 0; i < oldCursor; i++) {
      if (meaningful.test(oldVal[i])) charsLeft++;
    }

    // Strip everything except digits (and at most one dot if decimals allowed).
    let cleaned;
    if (decimal) {
      cleaned = oldVal.replace(/[^\d.]/g, "");
      const firstDot = cleaned.indexOf(".");
      if (firstDot !== -1) {
        cleaned =
          cleaned.slice(0, firstDot + 1) +
          cleaned.slice(firstDot + 1).replace(/\./g, "");
      }
    } else {
      cleaned = oldVal.replace(/[^\d]/g, "");
    }

    // Re-apply commas in the integer portion. Empty / lone "." are kept as-is
    // so the user can clear the field or start with a decimal.
    let formatted;
    if (cleaned === "" || cleaned === ".") {
      formatted = cleaned;
    } else if (decimal) {
      const [intPart, decPart] = cleaned.split(".");
      const intF = intPart === "" ? "0" : Number(intPart).toLocaleString("en-US");
      formatted = decPart !== undefined ? `${intF}.${decPart}` : intF;
    } else {
      formatted = Number(cleaned).toLocaleString("en-US");
    }

    // If a deletion has left only zeros at the start of the field (e.g. user
    // backspaced "800,000" → "00,000" → "0"), collapse to empty so the next
    // keystroke isn't stuck prepending to a leading zero.
    const onlyZeros = cleaned !== "" && cleaned !== "." && /^0+(\.0*)?$/.test(cleaned);
    if (onlyZeros && charsLeft === 0) {
      formatted = "";
      cleaned = "";
    }

    // Place the cursor at the same digit count in the new formatted string.
    let newCursor = 0;
    if (charsLeft > 0) {
      let count = 0;
      newCursor = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (meaningful.test(formatted[i])) count++;
        if (count >= charsLeft) {
          newCursor = i + 1;
          break;
        }
      }
    }
    pendingCursor.current = newCursor;
    setDraft(formatted);

    // Live-commit a parsed value if we have one. Empty / lone "." don't commit
    // (so the displayed result is stable while the user is mid-edit).
    if (cleaned !== "" && cleaned !== ".") {
      const num = Number(cleaned);
      if (!isNaN(num)) onChange(num);
    }
  };

  const handleFocus = () => {
    // If the field is sitting on a default-like 0, clear the draft so the
    // user's first keystroke goes in cleanly. For any non-zero value, leave
    // the cursor wherever the user tapped — the in-edit `onlyZeros` collapse
    // (above) handles the case where a surgical deletion leaves only zeros.
    setDraft(value === 0 ? "" : formatWithCommas(value, decimal));
  };

  const handleBlur = () => {
    const cleaned = (draft ?? "").replace(/,/g, "");
    if (cleaned === "" || cleaned === "." || isNaN(Number(cleaned))) {
      onChange(0);
    } else {
      onChange(Number(cleaned));
    }
    setDraft(null);
  };

  return (
    <label className={`block ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className="text-[11px] uppercase tracking-[0.14em] text-stone-600"
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif', fontWeight: 500 }}
        >
          {label}
        </span>
        {hint && (
          <span
            className="text-[10px] text-stone-500 italic"
            style={{ fontFamily: '"Fraunces", Georgia, serif' }}
          >
            {hint}
          </span>
        )}
      </div>
      <div className="relative flex items-center border border-stone-300 bg-[#FAF7EE] focus-within:border-emerald-900 transition-colors">
        {prefix && (
          <span
            className="pl-3 text-stone-500 text-sm"
            style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
          >
            {prefix}
          </span>
        )}
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
        {suffix && (
          <span className="pr-3 text-stone-500 text-xs uppercase tracking-wider">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
};

// ----- Required-vs-have comparison row -----

const ComparisonRow = ({ label, sublabel, required, have, suffix = "" }) => {
  const gap = required - have; // positive = shortfall, negative = surplus
  const tolerance = Math.max(1, required * 0.001);
  const isShort = gap > tolerance;
  const isLevel = Math.abs(gap) <= tolerance;
  const tone = isLevel ? "#6B6357" : isShort ? "#A04C2D" : "#2D5A3D";
  return (
    <div
      className="grid grid-cols-[1.1fr_1fr_1fr] gap-3 items-baseline pb-2.5 border-b border-dashed"
      style={{ borderColor: "#E5DFCC" }}
    >
      <div>
        <div className="text-sm">{label}</div>
        {sublabel && (
          <div
            className="text-[10px] text-stone-500 italic mt-0.5"
            style={{ fontFamily: '"Fraunces", serif' }}
          >
            {sublabel}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-[9px] uppercase tracking-[0.14em] text-stone-500 mb-0.5">
          need
        </div>
        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontVariantNumeric: "tabular-nums",
            fontSize: "0.95rem",
          }}
        >
          {fmt(required)}{suffix}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[9px] uppercase tracking-[0.14em] text-stone-500 mb-0.5">
          {isLevel ? "exact" : isShort ? "shortfall" : "surplus"}
        </div>
        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontVariantNumeric: "tabular-nums",
            fontSize: "0.95rem",
            color: tone,
            fontWeight: 600,
          }}
        >
          {isLevel ? "—" : `${isShort ? "−" : "+"}${fmt(Math.abs(gap))}${suffix}`}
        </div>
      </div>
    </div>
  );
};

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

// ----- Main component -----

const STORAGE_KEY = "landed_affordability_defaults_v1";
const FACTORY_DEFAULTS = {
  buyerMode: "joint",
  age1: 35,
  income1: 18000,
  age2: 34,
  income2: 14000,
  existingDebt: 800,
  cash: 800000,
  cpf1: 180000,
  cpf2: 140000,
  tenure: 25,
  propertyOrder: "first",
  propertyType: "condo",
  residency1: "sc",
  residency2: "sc",
  stressRate: 4.0,
  marketRate: 3.25,
  ltvTarget: null,
  absdRemission: false,
};

export default function LandedAffordabilityCalculator() {
  const [buyerMode, setBuyerMode] = useState(FACTORY_DEFAULTS.buyerMode);
  const [age1, setAge1] = useState(FACTORY_DEFAULTS.age1);
  const [income1, setIncome1] = useState(FACTORY_DEFAULTS.income1);
  const [age2, setAge2] = useState(FACTORY_DEFAULTS.age2);
  const [income2, setIncome2] = useState(FACTORY_DEFAULTS.income2);
  const [existingDebt, setExistingDebt] = useState(FACTORY_DEFAULTS.existingDebt);
  const [cash, setCash] = useState(FACTORY_DEFAULTS.cash);
  const [cpf1, setCpf1] = useState(FACTORY_DEFAULTS.cpf1);
  const [cpf2, setCpf2] = useState(FACTORY_DEFAULTS.cpf2);
  const [tenure, setTenure] = useState(FACTORY_DEFAULTS.tenure);
  const [propertyOrder, setPropertyOrder] = useState(FACTORY_DEFAULTS.propertyOrder);
  const [propertyType, setPropertyType] = useState(FACTORY_DEFAULTS.propertyType);
  const [residency1, setResidency1] = useState(FACTORY_DEFAULTS.residency1);
  const [residency2, setResidency2] = useState(FACTORY_DEFAULTS.residency2);
  const [stressRate, setStressRate] = useState(FACTORY_DEFAULTS.stressRate);
  const [marketRate, setMarketRate] = useState(FACTORY_DEFAULTS.marketRate);
  // Target price the user is evaluating. null = follow the computed max.
  const [targetOverride, setTargetOverride] = useState(null);
  // User's chosen loan-to-value cap (0–regulatory max). null = take the
  // regulatory maximum. Lower it to take a smaller loan and deploy more cash.
  const [ltvTarget, setLtvTarget] = useState(FACTORY_DEFAULTS.ltvTarget);
  const [absdRemission, setAbsdRemission] = useState(FACTORY_DEFAULTS.absdRemission);

  // Persistence: load saved defaults on mount, expose save/reset actions.
  const [hydrated, setHydrated] = useState(false);
  const [savedHasDefaults, setSavedHasDefaults] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | "saved" | "reset"

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (!cancelled && raw) {
          const s = JSON.parse(raw);
          if (typeof s.buyerMode === "string") setBuyerMode(s.buyerMode);
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
          if (typeof s.propertyType === "string") setPropertyType(s.propertyType);
          if (typeof s.residency1 === "string") setResidency1(s.residency1);
          if (typeof s.residency2 === "string") setResidency2(s.residency2);
          if (typeof s.stressRate === "number") setStressRate(s.stressRate);
          if (typeof s.marketRate === "number") setMarketRate(s.marketRate);
          if (s.ltvTarget === null || typeof s.ltvTarget === "number")
            setLtvTarget(s.ltvTarget);
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

  const saveAsDefaults = async () => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          buyerMode,
          age1, income1, age2, income2,
          existingDebt, cash, cpf1, cpf2,
          tenure, propertyOrder, propertyType, residency1, residency2, stressRate, marketRate, ltvTarget, absdRemission,
        })
      );
      setSavedHasDefaults(true);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      // Storage failed silently
    }
  };

  const resetToFactory = async () => {
    setBuyerMode(FACTORY_DEFAULTS.buyerMode);
    setAge1(FACTORY_DEFAULTS.age1);
    setIncome1(FACTORY_DEFAULTS.income1);
    setAge2(FACTORY_DEFAULTS.age2);
    setIncome2(FACTORY_DEFAULTS.income2);
    setExistingDebt(FACTORY_DEFAULTS.existingDebt);
    setCash(FACTORY_DEFAULTS.cash);
    setCpf1(FACTORY_DEFAULTS.cpf1);
    setCpf2(FACTORY_DEFAULTS.cpf2);
    setTenure(FACTORY_DEFAULTS.tenure);
    setPropertyOrder(FACTORY_DEFAULTS.propertyOrder);
    setPropertyType(FACTORY_DEFAULTS.propertyType);
    setResidency1(FACTORY_DEFAULTS.residency1);
    setResidency2(FACTORY_DEFAULTS.residency2);
    setStressRate(FACTORY_DEFAULTS.stressRate);
    setMarketRate(FACTORY_DEFAULTS.marketRate);
    setLtvTarget(FACTORY_DEFAULTS.ltvTarget);
    setAbsdRemission(FACTORY_DEFAULTS.absdRemission);
    setTargetOverride(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setSavedHasDefaults(false);
      setSaveStatus("reset");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      // ignore
    }
  };

  const c = useMemo(() => {
    const income2Eff = buyerMode === "solo" ? 0 : income2;
    const age2Eff = buyerMode === "solo" ? 0 : age2;
    const cpf2Eff = (buyerMode === "solo" || residency2 === "foreigner") ? 0 : cpf2;
    const cpf1Eff = residency1 === "foreigner" ? 0 : cpf1;

    const totalIncome = income1 + income2Eff;
    const totalCash = Math.max(0, cash);
    const totalCPF = Math.max(0, cpf1Eff + cpf2Eff);
    const totalFunds = totalCash + totalCPF;

    // TDSR
    const tdsrCap = 0.55 * totalIncome;
    const availableForMortgage = Math.max(0, tdsrCap - existingDebt);
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

    // ABSD: residency × property-order lookup.
    const absdRate = effectiveAbsdRate({
      buyerMode,
      residency1,
      residency2,
      propertyOrder,
      remission: absdRemission,
    });

    const maxPriceFromLoan = maxLoanTDSR / ltv;

    // Cash hard floor: minCash % + legal/valuation must be in cash
    const legalFees = 3500;
    const valuationFee = 500;
    const cashFees = legalFees + valuationFee;

    // Effective LTV. User can voluntarily take a smaller loan (and deploy more
    // cash) by lowering this below the regulatory cap. Default = regulatory ltv.
    const effectiveLTV =
      ltvTarget !== null ? Math.max(0, Math.min(ltvTarget, ltv)) : ltv;

    // Find max price subject to all constraints via binary search. The loan
    // at any given price is min(maxLoanTDSR, effectiveLTV × price) — meaning
    // when income caps the loan below the regulatory percentage, cash & CPF
    // can substitute for the missing borrowing capacity, extending the price
    // beyond the simple "loan/ltv" headline cap.
    let lo = 0;
    let hi = 80_000_000;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const bsd = calculateBSD(mid);
      const absd = absdRate * mid;
      const loanAtMid = Math.min(maxLoanTDSR, effectiveLTV * mid);
      const downpayment = mid - loanAtMid;
      const cashFloor = minCashPct * mid + cashFees;
      const mortStamp = Math.min(500, loanAtMid * 0.004);
      const totalNeeded = downpayment + bsd + absd + cashFees + mortStamp;
      const cashOK = cashFloor <= totalCash;
      const fundsOK = totalNeeded <= totalFunds;
      if (cashOK && fundsOK) lo = mid;
      else hi = mid;
    }
    const maxPrice = lo;

    // Bottleneck — what's binding at the max price?
    const loanAtMax = Math.min(maxLoanTDSR, effectiveLTV * maxPrice);
    const cashFloorAtMax = minCashPct * maxPrice + cashFees;
    const fundsAtMax =
      maxPrice -
      loanAtMax +
      calculateBSD(maxPrice) +
      absdRate * maxPrice +
      cashFees +
      Math.min(500, loanAtMax * 0.004);
    const incomeAtCapAtMax = loanAtMax >= maxLoanTDSR - 1 && maxLoanTDSR > 0;
    const cashFloorBinds = cashFloorAtMax >= totalCash - 1;
    const fundsBinds = fundsAtMax >= totalFunds - 1;

    let bottleneck;
    if (cashFloorBinds) bottleneck = "cash";
    else if (fundsBinds && incomeAtCapAtMax) bottleneck = "income+funds";
    else if (fundsBinds) bottleneck = "funds";
    else bottleneck = "funds";

    // For diagnostics, the funds-only cap (assuming max-LTV loan, prior model)
    let lo2 = 0;
    let hi2 = 80_000_000;
    for (let i = 0; i < 50; i++) {
      const mid = (lo2 + hi2) / 2;
      const downpayment = (1 - ltv) * mid;
      const totalNeeded =
        downpayment + calculateBSD(mid) + absdRate * mid + cashFees + Math.min(500, ltv * mid * 0.004);
      const cashFloor = minCashPct * mid + cashFees;
      if (cashFloor <= totalCash && totalNeeded <= totalFunds) lo2 = mid;
      else hi2 = mid;
    }
    const maxPriceFromFunds = lo2;

    // ----- Target price (slider-driven) -----
    // Default to maxPrice; user can slide to evaluate any target. All breakdowns
    // below reflect the *target*, while the comparison panel reveals the gap
    // (or surplus) versus the user's actual inputs.
    const target = targetOverride !== null ? targetOverride : maxPrice;
    const p = target;
    const loan = Math.min(maxLoanTDSR, effectiveLTV * p);
    const bsd = calculateBSD(p);
    const absd = absdRate * p;
    const downpayment = p - loan;
    const cashDp = minCashPct * p;
    const cpfDp = Math.max(0, downpayment - cashDp);
    const mortStamp = Math.min(500, loan * 0.004);
    const monthlyAtStress = monthlyPayment(loan, tenure, stressRate / 100);
    const monthlyAtMarket = monthlyPayment(loan, tenure, marketRate / 100);

    // Effective LTV at the target (loan / price). May be lower than the user's
    // chosen LTV cap when income (TDSR) limits the loan further.
    const effectiveLTVAtTarget = p > 0 ? loan / p : 0;
    const incomeAtCap = loan >= maxLoanTDSR - 1 && maxLoanTDSR > 0 && effectiveLTV * p > maxLoanTDSR;

    // Cash vs CPF deployment.
    // Items split into a hard cash floor (must be cash) and a flexible pool
    // (cash OR CPF). For the flexible pool we model a CPF-first draw — the
    // typical preference, since CPF in OA is otherwise locked and earns 2.5%.
    const cashFloor = cashDp + cashFees + mortStamp;        // cash only
    const flexibleFunds = cpfDp + bsd + absd;                // either bucket
    const cpfDrawn = Math.min(totalCPF, flexibleFunds);
    const cashDrawn = cashFloor + (flexibleFunds - cpfDrawn);
    const flexFromCash = flexibleFunds - cpfDrawn;

    // ----- Reverse calculation: what's required for this target -----
    // Two modes depending on feasibility:
    // • target ≤ max: use the *actual* loan the binary search settled on.
    //   This honestly reflects deployment — at max with income-capped loan,
    //   reqIncome = current income (exact, no phantom shortfall), and
    //   reqTotalFunds = exactly the user's funds (exact at the limit).
    // • target > max: switch to the *ideal* max-LTV loan. This surfaces
    //   income as the lever to lift first — without it, raising the price
    //   would just inflate the downpayment + look like a giant cash gap
    //   when the real fix is more income to unlock more loan.
    const isFeasible = target <= maxPrice + 1;
    const reverseLoan = isFeasible ? loan : effectiveLTV * p;
    const reverseDp = p - reverseLoan;
    const reverseMortStamp = Math.min(500, reverseLoan * 0.004);
    const reverseMonthly = monthlyPayment(reverseLoan, tenure, stressRate / 100);
    const reverseLTV = p > 0 ? reverseLoan / p : 0;

    const reqIncome = (reverseMonthly + existingDebt) / 0.55;
    const reqCashMin = cashDp + cashFees + reverseMortStamp;
    const reqTotalFunds = reverseDp + bsd + absd + cashFees + reverseMortStamp;

    const incomeGap = reqIncome - totalIncome;     // positive = shortfall
    const cashGap = reqCashMin - totalCash;
    const fundsGap = reqTotalFunds - totalFunds;
    // Affordability uses the actual maxPrice (which already includes cash-
    // compensating-for-income logic from the binary search), not the gaps.
    const canAfford = target <= maxPrice + 1;

    return {
      totalIncome,
      tdsrCap,
      availableForMortgage,
      maxLoanTDSR,
      weightedAge,
      reducedLTV,
      exceedsAge,
      exceedsTenure,
      ltv,
      effectiveLTV,
      effectiveLTVAtTarget,
      incomeAtCap,
      minCashPct,
      absdRate,
      maxPriceFromLoan,
      maxPriceFromFunds,
      maxPrice,
      bottleneck,
      target,
      loan,
      bsd,
      absd,
      downpayment,
      cashDp,
      cpfDp,
      cashFees,
      mortStamp,
      monthlyAtStress,
      monthlyAtMarket,
      cashFloor,
      flexibleFunds,
      cashDrawn,
      cpfDrawn,
      flexFromCash,
      totalCash,
      totalCPF,
      totalFunds,
      reqIncome,
      reqCashMin,
      reqTotalFunds,
      reverseMonthly,
      reverseLTV,
      isFeasible,
      incomeGap,
      cashGap,
      fundsGap,
      canAfford,
    };
  }, [
    buyerMode, absdRemission,
    age1, age2, income1, income2, existingDebt, cash, cpf1, cpf2,
    tenure, propertyOrder, residency1, residency2, stressRate, marketRate, targetOverride, ltvTarget,
  ]);

  const bottleneckLabel = {
    "income+funds": "Income + cash/CPF",
    cash: "Minimum cash downpayment",
    funds: "Total cash + CPF",
  }[c.bottleneck] || "Total cash + CPF";

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

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "#F4EFE2",
        fontFamily: '"DM Sans", system-ui, sans-serif',
        color: "#1F2421",
      }}
    >
      <style>{`
        
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=range].emerald-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 2px;
          background: #1B4332;
          outline: none;
        }
        input[type=range].emerald-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px; height: 18px;
          background: #FAF7EE;
          border: 1.5px solid #1B4332;
          border-radius: 50%;
          cursor: pointer;
        }
        input[type=range].emerald-slider::-moz-range-thumb {
          width: 18px; height: 18px;
          background: #FAF7EE;
          border: 1.5px solid #1B4332;
          border-radius: 50%;
          cursor: pointer;
        }
        input[type=range].price-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 2px;
          background: rgba(244, 239, 226, 0.28);
          outline: none;
        }
        input[type=range].price-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px; height: 22px;
          background: #C9A96E;
          border: 2px solid #F4EFE2;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(0,0,0,0.35);
        }
        input[type=range].price-slider::-moz-range-thumb {
          width: 22px; height: 22px;
          background: #C9A96E;
          border: 2px solid #F4EFE2;
          border-radius: 50%;
          cursor: pointer;
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 py-10 md:py-14">
        {/* Header */}
        <header className="mb-10 md:mb-14">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="inline-block w-1.5 h-1.5 bg-emerald-900"
              style={{ background: "#1B4332" }}
            />
            <span
              className="text-[10px] uppercase tracking-[0.28em] text-stone-600"
              style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600 }}
            >
              Singapore · Married Citizen Couple
            </span>
          </div>
          <h1
            className="text-4xl md:text-6xl leading-[0.95] tracking-tight"
            style={{
              fontFamily: '"Fraunces", Georgia, serif',
              fontWeight: 400,
              fontVariationSettings: '"opsz" 144, "wght" 380',
              color: "#1F2421",
            }}
          >
            Landed Property
            <span style={{ fontStyle: "italic", fontWeight: 300 }}> Affordability</span>
          </h1>
          <p
            className="mt-4 max-w-2xl text-stone-700 text-[15px] leading-relaxed"
            style={{ fontFamily: '"Fraunces", Georgia, serif', fontWeight: 300 }}
          >
            A complete affordability model accounting for TDSR, LTV tiers, age-weighted
            tenure rules, BSD &amp; ABSD, plus the cash-versus-CPF split that decides
            what you can actually buy.
          </p>
        </header>

        <div className="grid lg:grid-cols-[1.05fr_1.4fr] gap-6 lg:gap-10">
          {/* INPUTS */}
          <section
            className="bg-[#FAF7EE] border border-stone-300 p-5 md:p-7 space-y-7"
            style={{ borderColor: "#D9D2BF" }}
          >
            {/* Persistence toolbar */}
            <div
              className="flex items-center justify-between gap-3 -mt-1 -mb-3 pb-3 border-b border-dashed"
              style={{ borderColor: "#E5DFCC" }}
            >
              <div
                className="text-[10px] italic text-stone-500 leading-relaxed"
                style={{ fontFamily: '"Fraunces", serif' }}
              >
                {saveStatus === "saved"
                  ? "✓ Saved as your defaults"
                  : saveStatus === "reset"
                  ? "↻ Restored factory values"
                  : savedHasDefaults
                  ? "Loaded from your saved defaults"
                  : "Using factory defaults"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetToFactory}
                  className="text-[10px] uppercase tracking-[0.14em] px-2.5 py-1.5 border hover:bg-[#F4EFE2] transition-colors"
                  style={{
                    borderColor: "#D9D2BF",
                    color: "#6B6357",
                    fontWeight: 600,
                  }}
                >
                  Reset
                </button>
                <button
                  onClick={saveAsDefaults}
                  className="text-[10px] uppercase tracking-[0.14em] px-2.5 py-1.5 border transition-colors"
                  style={{
                    borderColor: "#1B4332",
                    background: "#1B4332",
                    color: "#FAF7EE",
                    fontWeight: 600,
                  }}
                >
                  Save as defaults
                </button>
              </div>
            </div>

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

            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h2
                  className="text-[11px] uppercase tracking-[0.2em]"
                  style={{ fontWeight: 600, color: "#1B4332" }}
                >
                  {buyerMode === "solo" ? "① The Buyer" : "① The Couple"}
                </h2>
                <span className="text-xs text-stone-500">Income-weighted age</span>
              </div>
              <div className={buyerMode === "solo" ? "" : "grid grid-cols-2 gap-4"}>
                <div className="space-y-3">
                  <p className="text-xs text-stone-600 italic" style={{ fontFamily: '"Fraunces", serif' }}>
                    {buyerMode === "solo" ? "Buyer" : "Spouse 1"}
                  </p>
                  <NumberInput label="Age" value={age1} onChange={setAge1} suffix="yrs" />
                  <NumberInput label="Gross Income / mo" value={income1} onChange={setIncome1} prefix="S$" />
                  <NumberInput
                    label="CPF OA"
                    value={cpf1}
                    onChange={setCpf1}
                    prefix="S$"
                    disabled={residency1 === "foreigner"}
                    hint={residency1 === "foreigner" ? "Foreigners cannot use CPF" : undefined}
                  />
                  {renderResidencySelect(residency1, setResidency1)}
                </div>
                {buyerMode === "joint" && (
                <div className="space-y-3">
                  <p className="text-xs text-stone-600 italic" style={{ fontFamily: '"Fraunces", serif' }}>
                    Spouse 2
                  </p>
                  <NumberInput label="Age" value={age2} onChange={setAge2} suffix="yrs" />
                  <NumberInput label="Gross Income / mo" value={income2} onChange={setIncome2} prefix="S$" />
                  <NumberInput
                    label="CPF OA"
                    value={cpf2}
                    onChange={setCpf2}
                    prefix="S$"
                    disabled={residency2 === "foreigner"}
                    hint={residency2 === "foreigner" ? "Foreigners cannot use CPF" : undefined}
                  />
                  {renderResidencySelect(residency2, setResidency2)}
                </div>
                )}
              </div>
            </div>

            <div className="border-t border-stone-300 pt-6" style={{ borderColor: "#D9D2BF" }}>
              <h2
                className="text-[11px] uppercase tracking-[0.2em] mb-4"
                style={{ fontWeight: 600, color: "#1B4332" }}
              >
                ② Resources &amp; Obligations
              </h2>
              <div className="space-y-3">
                <NumberInput
                  label="Cash savings (combined)"
                  value={cash}
                  onChange={setCash}
                  prefix="S$"
                  hint="for downpayment, BSD, fees"
                />
                <NumberInput
                  label="Existing monthly debts"
                  value={existingDebt}
                  onChange={setExistingDebt}
                  prefix="S$"
                  hint="car loans, credit cards"
                />
              </div>
            </div>

            <div className="border-t border-stone-300 pt-6" style={{ borderColor: "#D9D2BF" }}>
              <h2
                className="text-[11px] uppercase tracking-[0.2em] mb-4"
                style={{ fontWeight: 600, color: "#1B4332" }}
              >
                ③ Loan &amp; Property
              </h2>

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
              </div>

              <div className="mb-5">
                <div className="flex items-baseline justify-between mb-2">
                  <span
                    className="text-[11px] uppercase tracking-[0.14em] text-stone-600"
                    style={{ fontWeight: 500 }}
                  >
                    Loan Tenure
                  </span>
                  <span
                    className="text-base"
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontVariantNumeric: "tabular-nums",
                      color: "#1B4332",
                      fontWeight: 600,
                    }}
                  >
                    {tenure} years
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="35"
                  step="1"
                  value={tenure}
                  onChange={(e) => setTenure(Number(e.target.value))}
                  className="emerald-slider w-full"
                />
                <div className="flex justify-between text-[10px] text-stone-500 mt-1">
                  <span>5</span>
                  <span>30 (max for top LTV)</span>
                  <span>35</span>
                </div>
              </div>

              <div className="mb-5">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[11px] uppercase tracking-[0.14em] text-stone-600"
                      style={{ fontWeight: 500 }}
                    >
                      Loan Cap (LTV)
                    </span>
                    {ltvTarget !== null && (
                      <button
                        onClick={() => setLtvTarget(null)}
                        className="text-[9px] uppercase tracking-[0.14em] opacity-70 hover:opacity-100"
                        style={{ color: "#1B4332", fontWeight: 600 }}
                      >
                        ↻ max
                      </button>
                    )}
                  </div>
                  <span
                    className="text-base"
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontVariantNumeric: "tabular-nums",
                      color: "#1B4332",
                      fontWeight: 600,
                    }}
                  >
                    {(c.effectiveLTV * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.round(c.ltv * 100)}
                  step="1"
                  value={Math.round(c.effectiveLTV * 100)}
                  onChange={(e) => setLtvTarget(Number(e.target.value) / 100)}
                  className="emerald-slider w-full"
                />
                <div className="flex justify-between text-[10px] text-stone-500 mt-1">
                  <span>0% (cash buy)</span>
                  <span
                    className="italic"
                    style={{ fontFamily: '"Fraunces", serif' }}
                  >
                    actual:{" "}
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontStyle: "normal",
                        color: c.incomeAtCap ? "#A04C2D" : "#1B4332",
                      }}
                    >
                      {(c.effectiveLTVAtTarget * 100).toFixed(1)}%
                    </span>
                    {c.incomeAtCap && " · TDSR-capped"}
                  </span>
                  <span>{(c.ltv * 100).toFixed(0)}% reg</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <NumberInput
                  label="Stress test rate"
                  value={stressRate}
                  onChange={setStressRate}
                  suffix="%"
                  hint="MAS floor: 4%"
                  decimal
                />
                <NumberInput
                  label="Market rate (illustrative)"
                  value={marketRate}
                  onChange={setMarketRate}
                  suffix="%"
                  decimal
                />
              </div>

              <div>
                <div
                  className="text-[11px] uppercase tracking-[0.14em] text-stone-600 mb-2"
                  style={{ fontWeight: 500 }}
                >
                  Property Order (for ABSD &amp; LTV)
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { v: "first", label: "1st", absd: "0%" },
                    { v: "second", label: "2nd", absd: "20%" },
                    { v: "third", label: "3rd+", absd: "30%" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setPropertyOrder(o.v)}
                      className="py-2.5 px-2 text-center transition-colors border"
                      style={{
                        background: propertyOrder === o.v ? "#1B4332" : "#FAF7EE",
                        color: propertyOrder === o.v ? "#FAF7EE" : "#1F2421",
                        borderColor: propertyOrder === o.v ? "#1B4332" : "#D9D2BF",
                      }}
                    >
                      <div className="text-sm font-semibold">{o.label}</div>
                      <div
                        className="text-[10px] opacity-80 mt-0.5"
                        style={{ fontFamily: '"JetBrains Mono", monospace' }}
                      >
                        ABSD {o.absd}
                      </div>
                    </button>
                  ))}
                </div>
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
              </div>
            </div>
          </section>

          {/* RESULTS */}
          <section className="space-y-6">
            {/* Target Price + slider */}
            <div
              className="p-7 md:p-9 relative overflow-hidden"
              style={{ background: "#1B4332", color: "#F4EFE2" }}
            >
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 opacity-80">
                  <span
                    className="inline-block w-1.5 h-1.5"
                    style={{ background: "#C9A96E" }}
                  />
                  <span
                    className="text-[10px] uppercase tracking-[0.28em]"
                    style={{ fontWeight: 500 }}
                  >
                    Target Price
                  </span>
                </div>
                {targetOverride !== null && (
                  <button
                    onClick={() => setTargetOverride(null)}
                    className="text-[10px] uppercase tracking-[0.16em] opacity-80 hover:opacity-100 transition-opacity"
                    style={{ color: "#C9A96E", fontWeight: 600 }}
                  >
                    ↻ Snap to max
                  </button>
                )}
              </div>
              <div
                className="text-5xl md:text-7xl leading-none tracking-tight"
                style={{
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontWeight: 350,
                  fontVariationSettings: '"opsz" 144',
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmt(c.target)}
              </div>

              <div className="mt-5">
                <input
                  type="range"
                  min={500_000}
                  max={Math.max(
                    30_000_000,
                    Math.ceil((c.maxPrice * 1.5) / 100_000) * 100_000
                  )}
                  step={50_000}
                  value={Math.max(500_000, c.target)}
                  onChange={(e) => setTargetOverride(Number(e.target.value))}
                  className="price-slider"
                />
                <div
                  className="flex justify-between text-[10px] mt-1.5 opacity-70"
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span>S$500K</span>
                  <span style={{ fontFamily: '"Fraunces", serif', fontStyle: "italic" }}>
                    Your max: {fmt(c.maxPrice)}
                  </span>
                  <span>
                    S${Math.round(
                      Math.max(30_000_000, Math.ceil((c.maxPrice * 1.5) / 100_000) * 100_000) /
                        1_000_000
                    )}M
                  </span>
                </div>
              </div>

              <div
                className="mt-6 grid grid-cols-2 gap-4 text-sm pt-5 border-t"
                style={{ borderColor: "rgba(244,239,226,0.18)" }}
              >
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70 mb-1">
                    Loan Amount
                  </div>
                  <div
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontVariantNumeric: "tabular-nums",
                      fontSize: "1.05rem",
                    }}
                  >
                    {fmt(c.loan)}
                  </div>
                  <div className="text-[10px] opacity-70 mt-0.5">
                    {(c.effectiveLTVAtTarget * 100).toFixed(1)}% LTV
                    {c.incomeAtCap && " · TDSR-capped"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70 mb-1">
                    Status
                  </div>
                  <div
                    className="text-base"
                    style={{
                      fontFamily: '"Fraunces", serif',
                      fontStyle: "italic",
                      color: c.canAfford ? "#C9A96E" : "#E89B6C",
                    }}
                  >
                    {c.canAfford
                      ? targetOverride === null || c.target >= c.maxPrice - 1
                        ? `Limited by ${bottleneckLabel.toLowerCase()}`
                        : "Within reach"
                      : "Requires upgrades"}
                  </div>
                </div>
              </div>

              {c.reducedLTV && (
                <div
                  className="mt-4 text-[11px] px-3 py-2 inline-block"
                  style={{
                    background: "rgba(201,169,110,0.15)",
                    color: "#C9A96E",
                    fontFamily: '"Fraunces", serif',
                    fontStyle: "italic",
                  }}
                >
                  ⚠ LTV reduced — {c.exceedsAge ? "loan extends past age 65" : ""}
                  {c.exceedsAge && c.exceedsTenure ? " & " : ""}
                  {c.exceedsTenure ? "tenure exceeds 30 years" : ""}
                </div>
              )}
            </div>

            {/* Required vs Have — reverse calculation */}
            <div
              className="bg-[#FAF7EE] border p-5 md:p-7"
              style={{ borderColor: "#D9D2BF" }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <h3
                  className="text-[11px] uppercase tracking-[0.2em]"
                  style={{ fontWeight: 600, color: "#1B4332" }}
                >
                  To Afford This Price
                </h3>
                <span
                  className="text-[10px] italic text-stone-500"
                  style={{ fontFamily: '"Fraunces", serif' }}
                >
                  at {(c.reverseLTV * 100).toFixed(1)}% LTV
                </span>
              </div>
              <p
                className="text-[11px] text-stone-600 italic mb-5 leading-relaxed"
                style={{ fontFamily: '"Fraunces", serif' }}
              >
                {c.isFeasible
                  ? `These reflect the actual structure at this target — you're within reach. Surpluses show how much slack you have on each lever.`
                  : `Income is the first lever — bumping it up unlocks a bigger loan and reduces the cash you'd otherwise need. Cash & CPF only cover the ${((1 - c.effectiveLTV) * 100).toFixed(0)}% downpayment, BSD & fees once income supports the full LTV.`}
              </p>
              <div className="space-y-3">
                <ComparisonRow
                  label="Combined gross income"
                  sublabel={`covers ${fmt(c.reverseMonthly + existingDebt)}/mo of debt @ 55% TDSR`}
                  required={c.reqIncome}
                  have={c.totalIncome}
                  suffix=" / mo"
                />
                <ComparisonRow
                  label="Cash on hand"
                  sublabel={`${(c.minCashPct * 100).toFixed(0)}% min cash + legal & valuation`}
                  required={c.reqCashMin}
                  have={c.totalCash}
                />
                <ComparisonRow
                  label="Total cash + CPF"
                  sublabel={`${((1 - c.reverseLTV) * 100).toFixed(0)}% downpayment + BSD${c.absd > 0 ? " + ABSD" : ""} + fees`}
                  required={c.reqTotalFunds}
                  have={c.totalFunds}
                />
              </div>
              {!c.canAfford && (
                <div
                  className="mt-5 text-[12px] px-3 py-2 leading-relaxed"
                  style={{
                    background: "rgba(160,76,45,0.08)",
                    color: "#A04C2D",
                    fontFamily: '"Fraunces", serif',
                    fontStyle: "italic",
                  }}
                >
                  Slide the price down, or close the gap by raising income, building cash,
                  or topping up CPF.
                </div>
              )}
            </div>

            {/* Capital stack */}
            <div
              className="bg-[#FAF7EE] border p-5 md:p-7"
              style={{ borderColor: "#D9D2BF" }}
            >
              <h3
                className="text-[11px] uppercase tracking-[0.2em] mb-5"
                style={{ fontWeight: 600, color: "#1B4332" }}
              >
                Capital Stack
              </h3>
              {/* Bar */}
              <div className="flex h-9 w-full overflow-hidden mb-4 border" style={{ borderColor: "#D9D2BF" }}>
                <div
                  style={{
                    width: `${c.target > 0 ? (c.cashDp / c.target) * 100 : 0}%`,
                    background: "#A8723F",
                  }}
                  title="Cash downpayment (mandatory)"
                />
                <div
                  style={{
                    width: `${c.target > 0 ? (c.cpfDp / c.target) * 100 : 0}%`,
                    background: "#C9A96E",
                  }}
                  title="Flexible downpayment (cash or CPF)"
                />
                <div
                  style={{
                    width: `${c.target > 0 ? (c.loan / c.target) * 100 : 0}%`,
                    background: "#1B4332",
                  }}
                  title="Bank loan"
                />
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs">
                {[
                  { label: "Min Cash", color: "#A8723F", val: c.cashDp },
                  { label: "Cash / CPF", color: "#C9A96E", val: c.cpfDp },
                  { label: "Loan", color: "#1B4332", val: c.loan },
                ].map((row) => {
                  const pct = c.target > 0 ? row.val / c.target : 0;
                  return (
                    <div key={row.label}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="inline-block w-2 h-2" style={{ background: row.color }} />
                        <span className="text-stone-600 uppercase tracking-wider text-[10px]">{row.label}</span>
                      </div>
                      <div
                        style={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontVariantNumeric: "tabular-nums",
                          fontSize: "0.95rem",
                        }}
                      >
                        {fmtCompact(row.val)}
                      </div>
                      <div className="text-[10px] text-stone-500">
                        {(pct * 100).toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upfront cost breakdown */}
            <div
              className="bg-[#FAF7EE] border p-5 md:p-7"
              style={{ borderColor: "#D9D2BF" }}
            >
              <h3
                className="text-[11px] uppercase tracking-[0.2em] mb-5"
                style={{ fontWeight: 600, color: "#1B4332" }}
              >
                Upfront Outlay
              </h3>
              <div className="space-y-2.5 text-sm">
                {[
                  ["Cash downpayment", c.cashDp, `${(c.minCashPct * 100).toFixed(0)}% min cash`, "cash"],
                  ["CPF / cash downpayment", c.cpfDp, `${((1 - c.ltv - c.minCashPct) * 100).toFixed(0)}%`, "either"],
                  ["Buyer's Stamp Duty", c.bsd, "tiered 1–6%", "either"],
                  ...(c.absd > 0
                    ? [["Additional BSD", c.absd, `${(c.absdRate * 100).toFixed(0)}% ABSD`, "either"]]
                    : []),
                  ["Mortgage stamp duty", c.mortStamp, "0.4%, capped at $500", "cash"],
                  ["Legal + valuation", c.cashFees, "approximate", "cash"],
                ].map(([label, val, note, type]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-3 py-1.5 border-b border-dashed"
                    style={{ borderColor: "#E5DFCC" }}
                  >
                    <div>
                      <div>{label}</div>
                      <div
                        className="text-[10px] text-stone-500 italic"
                        style={{ fontFamily: '"Fraunces", serif' }}
                      >
                        {note} · {type === "cash" ? "cash only" : "cash or CPF"}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 500,
                      }}
                    >
                      {fmt(val)}
                    </div>
                  </div>
                ))}
                <div className="pt-3">
                  {/* Visual stack: mandatory cash + flex-from-cash + flex-from-CPF */}
                  <div
                    className="flex h-7 w-full overflow-hidden border mb-3"
                    style={{ borderColor: "#D9D2BF" }}
                    title="Mandatory cash · Flex from cash · Flex from CPF"
                  >
                    {c.cashFloor > 0 && (
                      <div
                        style={{
                          width: `${(c.cashFloor / (c.cashDrawn + c.cpfDrawn)) * 100}%`,
                          background: "#A8723F",
                        }}
                      />
                    )}
                    {c.flexFromCash > 0 && (
                      <div
                        style={{
                          width: `${(c.flexFromCash / (c.cashDrawn + c.cpfDrawn)) * 100}%`,
                          background: "#D9A66B",
                        }}
                      />
                    )}
                    {c.cpfDrawn > 0 && (
                      <div
                        style={{
                          width: `${(c.cpfDrawn / (c.cashDrawn + c.cpfDrawn)) * 100}%`,
                          background: "#1B4332",
                        }}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-1">
                        Cash Deployed
                      </div>
                      <div
                        style={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontVariantNumeric: "tabular-nums",
                          fontSize: "1.15rem",
                          color: c.cashDrawn > c.totalCash ? "#A04C2D" : "#A8723F",
                          fontWeight: 600,
                        }}
                      >
                        {fmt(c.cashDrawn)}
                      </div>
                      <div className="text-[10px] text-stone-500">
                        of {fmt(c.totalCash)} available
                      </div>
                      <div
                        className="text-[10px] text-stone-600 italic mt-1.5 leading-snug"
                        style={{ fontFamily: '"Fraunces", serif' }}
                      >
                        <span style={{ color: "#A8723F", fontStyle: "normal" }}>■</span>{" "}
                        {fmt(c.cashFloor)} mandatory
                        {c.flexFromCash > 0 && (
                          <>
                            <br />
                            <span style={{ color: "#D9A66B", fontStyle: "normal" }}>■</span>{" "}
                            {fmt(c.flexFromCash)} flex top-up
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-1">
                        CPF Deployed
                      </div>
                      <div
                        style={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontVariantNumeric: "tabular-nums",
                          fontSize: "1.15rem",
                          color: "#1B4332",
                          fontWeight: 600,
                        }}
                      >
                        {fmt(c.cpfDrawn)}
                      </div>
                      <div className="text-[10px] text-stone-500">
                        of {fmt(c.totalCPF)} available
                      </div>
                      <div
                        className="text-[10px] text-stone-600 italic mt-1.5 leading-snug"
                        style={{ fontFamily: '"Fraunces", serif' }}
                      >
                        <span style={{ color: "#1B4332", fontStyle: "normal" }}>■</span>{" "}
                        toward downpayment, BSD{c.absd > 0 ? ", ABSD" : ""}
                      </div>
                    </div>
                  </div>

                  <div
                    className="mt-3 pt-3 border-t text-[10px] text-stone-500 italic leading-relaxed"
                    style={{ borderColor: "#E5DFCC", fontFamily: '"Fraunces", serif' }}
                  >
                    Flexible items (downpayment beyond the {(c.minCashPct * 100).toFixed(0)}%
                    cash floor, BSD{c.absd > 0 ? " and ABSD" : ""}) drawn from CPF first to
                    preserve liquid cash, then topped up with cash if CPF is exhausted.
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly */}
            <div className="grid grid-cols-2 gap-4">
              <div
                className="bg-[#FAF7EE] border p-5"
                style={{ borderColor: "#D9D2BF" }}
              >
                <div
                  className="text-[10px] uppercase tracking-[0.2em] text-stone-600 mb-1"
                  style={{ fontWeight: 600 }}
                >
                  Monthly @ {stressRate}%
                </div>
                <div
                  style={{
                    fontFamily: '"Fraunces", serif',
                    fontWeight: 400,
                    fontSize: "1.7rem",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmt(c.monthlyAtStress)}
                </div>
                <div className="text-[10px] text-stone-500 italic" style={{ fontFamily: '"Fraunces", serif' }}>
                  stress test instalment
                </div>
              </div>
              <div
                className="border p-5"
                style={{ borderColor: "#1B4332", background: "#F4EFE2" }}
              >
                <div
                  className="text-[10px] uppercase tracking-[0.2em] mb-1"
                  style={{ fontWeight: 600, color: "#1B4332" }}
                >
                  Monthly @ {marketRate}%
                </div>
                <div
                  style={{
                    fontFamily: '"Fraunces", serif',
                    fontWeight: 400,
                    fontSize: "1.7rem",
                    fontVariantNumeric: "tabular-nums",
                    color: "#1B4332",
                  }}
                >
                  {fmt(c.monthlyAtMarket)}
                </div>
                <div className="text-[10px] text-stone-600 italic" style={{ fontFamily: '"Fraunces", serif' }}>
                  expected actual instalment
                </div>
              </div>
            </div>

            {/* Diagnostics */}
            <div
              className="bg-[#FAF7EE] border p-5 md:p-7 text-[13px]"
              style={{ borderColor: "#D9D2BF" }}
            >
              <h3
                className="text-[11px] uppercase tracking-[0.2em] mb-4"
                style={{ fontWeight: 600, color: "#1B4332" }}
              >
                Diagnostics
              </h3>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {[
                  ["Combined gross income", `${fmt(c.totalIncome)} / mo`],
                  ["TDSR cap (55%)", `${fmt(c.tdsrCap)} / mo`],
                  ["After existing debts", `${fmt(c.availableForMortgage)} / mo`],
                  ["Income-weighted age", `${c.weightedAge.toFixed(1)} yrs`],
                  ["Age + tenure", `${(c.weightedAge + tenure).toFixed(1)} yrs`],
                  ["Max loan (TDSR @ 4%)", fmt(c.maxLoanTDSR)],
                  ["Max price · loan-bound", fmt(c.maxPriceFromLoan)],
                  ["Max price · funds-bound", fmt(c.maxPriceFromFunds)],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-2 border-b border-dashed pb-1"
                    style={{ borderColor: "#E5DFCC" }}
                  >
                    <span className="text-stone-600">{k}</span>
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 500,
                      }}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Footnotes */}
        <footer
          className="mt-12 pt-6 border-t text-[11px] text-stone-600 leading-relaxed grid md:grid-cols-3 gap-5"
          style={{ borderColor: "#D9D2BF", fontFamily: '"Fraunces", serif' }}
        >
          <div>
            <span style={{ fontWeight: 600, fontStyle: "normal" }}>Citizenship.</span>{" "}
            Only Singapore Citizens may purchase landed property on the mainland;
            Sentosa Cove permits PRs subject to LDAU approval.
          </div>
          <div>
            <span style={{ fontWeight: 600, fontStyle: "normal" }}>TDSR.</span>{" "}
            Total Debt Servicing Ratio capped at 55% of gross income, computed at
            the medium-term interest floor of 4% for residential property.
          </div>
          <div>
            <span style={{ fontWeight: 600, fontStyle: "normal" }}>LTV.</span>{" "}
            Drops to 55% (1st loan) when tenure exceeds 30 years or runs past age 65,
            using income-weighted age. Min cash component rises to 10% accordingly.
          </div>
          <div>
            <span style={{ fontWeight: 600, fontStyle: "normal" }}>BSD.</span>{" "}
            Tiered: 1% / 2% / 3% / 4% / 5% / 6% across $180k / $180k / $640k / $500k /
            $1.5M / above-$3M brackets.
          </div>
          <div>
            <span style={{ fontWeight: 600, fontStyle: "normal" }}>ABSD.</span>{" "}
            Both-SC married couple: 0% on first matrimonial home; 20% on second; 30%
            on third+. Remission available if existing property sold within 6 months.
          </div>
          <div>
            <span style={{ fontWeight: 600, fontStyle: "normal" }}>CPF.</span>{" "}
            Calculator assumes both spouses meet Basic Retirement Sum so CPF OA is
            usable to the Withdrawal Limit (120% of valuation).
          </div>
        </footer>
      </div>
    </div>
  );
}
