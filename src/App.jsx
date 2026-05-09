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

// Shareable link: encodes the current settings in a hash fragment so a
// recipient sees the same scenario. Hash fragments are not sent to
// origin servers, which matters because the payload includes income / CPF.
const SHARE_PARAM = "s";

const SHAREABLE_FIELDS = [
  "buyerMode", "age1", "income1", "age2", "income2",
  "existingDebt1", "existingDebt2", "cash1", "cash2", "cpf1", "cpf2",
  "tenure", "propertyOrder", "stressRate", "marketRate", "ltvTarget",
  "propertyType", "residency1", "residency2", "absdRemission",
  "loanType", "firstTimer", "flatType", "proximity",
];

function encodeShareUrl(settings) {
  const subset = {};
  for (const k of SHAREABLE_FIELDS) {
    if (settings[k] !== undefined) subset[k] = settings[k];
  }
  const blob = btoa(JSON.stringify(subset));
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${SHARE_PARAM}=${blob}`;
}

function readShareFromHash() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const m = hash.match(new RegExp(`(?:^#|&)${SHARE_PARAM}=([^&]+)`));
  if (!m) return null;
  try {
    const json = atob(decodeURIComponent(m[1]));
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearShareFromUrl() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}`);
}

// ----- Main component -----

const STORAGE_KEY = "sg_property_affordability_v2";
const FACTORY_DEFAULTS = {
  buyerMode: "joint",
  age1: 35,
  income1: 18000,
  age2: 34,
  income2: 14000,
  existingDebt1: 500,
  existingDebt2: 300,
  cash1: 500000,
  cash2: 300000,
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
  loanType: "hdb",
  firstTimer: true,
  flatType: "4room",
  proximity: "none",
};

// ----- Icons (Lucide-style, inline to avoid a dependency) -----
// All icons render at the size set via width/height on the parent button's
// child SVG. They use currentColor so they inherit the button text color.

const iconSvgProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

const RotateCcwIcon = () => (
  <svg {...iconSvgProps}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const LinkIcon = () => (
  <svg {...iconSvgProps}>
    <path d="M9 17H7A5 5 0 0 1 7 7h2" />
    <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const BookmarkIcon = () => (
  <svg {...iconSvgProps}>
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </svg>
);

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

export default function PrivatePropertyAffordabilityCalculator() {
  const [buyerMode, setBuyerMode] = useState(FACTORY_DEFAULTS.buyerMode);
  const [age1, setAge1] = useState(FACTORY_DEFAULTS.age1);
  const [income1, setIncome1] = useState(FACTORY_DEFAULTS.income1);
  const [age2, setAge2] = useState(FACTORY_DEFAULTS.age2);
  const [income2, setIncome2] = useState(FACTORY_DEFAULTS.income2);
  const [existingDebt1, setExistingDebt1] = useState(FACTORY_DEFAULTS.existingDebt1);
  const [existingDebt2, setExistingDebt2] = useState(FACTORY_DEFAULTS.existingDebt2);
  const [cash1, setCash1] = useState(FACTORY_DEFAULTS.cash1);
  const [cash2, setCash2] = useState(FACTORY_DEFAULTS.cash2);
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
  const [loanType, setLoanType] = useState(FACTORY_DEFAULTS.loanType);
  const [firstTimer, setFirstTimer] = useState(FACTORY_DEFAULTS.firstTimer);
  const [flatType, setFlatType] = useState(FACTORY_DEFAULTS.flatType);
  const [proximity, setProximity] = useState(FACTORY_DEFAULTS.proximity);

  const isHdb = propertyType === "hdb_bto" || propertyType === "hdb_resale";

  // Persistence: load saved defaults on mount, expose save/reset actions.
  const [hydrated, setHydrated] = useState(false);
  const [savedHasDefaults, setSavedHasDefaults] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | "saved" | "reset"

  // Apply a parsed shared-settings blob to state. Used both on initial mount
  // and on hashchange (so pasting a share URL into an already-open tab works).
  const applyShared = (shared) => {
    if (typeof shared.age1 === "number") setAge1(shared.age1);
    if (typeof shared.income1 === "number") setIncome1(shared.income1);
    if (typeof shared.age2 === "number") setAge2(shared.age2);
    if (typeof shared.income2 === "number") setIncome2(shared.income2);
    if (typeof shared.existingDebt1 === "number") setExistingDebt1(shared.existingDebt1);
    else if (typeof shared.existingDebt === "number") { setExistingDebt1(shared.existingDebt); setExistingDebt2(0); }
    if (typeof shared.existingDebt2 === "number") setExistingDebt2(shared.existingDebt2);
    if (typeof shared.cash1 === "number") setCash1(shared.cash1);
    else if (typeof shared.cash === "number") { setCash1(shared.cash); setCash2(0); }
    if (typeof shared.cash2 === "number") setCash2(shared.cash2);
    if (typeof shared.cpf1 === "number") setCpf1(shared.cpf1);
    if (typeof shared.cpf2 === "number") setCpf2(shared.cpf2);
    if (typeof shared.tenure === "number") setTenure(shared.tenure);
    if (typeof shared.propertyOrder === "string") setPropertyOrder(shared.propertyOrder);
    if (typeof shared.stressRate === "number") setStressRate(shared.stressRate);
    if (typeof shared.marketRate === "number") setMarketRate(shared.marketRate);
    if (shared.ltvTarget === null || typeof shared.ltvTarget === "number")
      setLtvTarget(shared.ltvTarget);
    if (typeof shared.propertyType === "string") setPropertyType(shared.propertyType);
    if (typeof shared.buyerMode === "string") setBuyerMode(shared.buyerMode);
    if (typeof shared.residency1 === "string") setResidency1(shared.residency1);
    if (typeof shared.residency2 === "string") setResidency2(shared.residency2);
    if (typeof shared.absdRemission === "boolean") setAbsdRemission(shared.absdRemission);
    if (typeof shared.loanType === "string") setLoanType(shared.loanType);
    if (typeof shared.firstTimer === "boolean") setFirstTimer(shared.firstTimer);
    if (typeof shared.flatType === "string") setFlatType(shared.flatType);
    if (typeof shared.proximity === "string") setProximity(shared.proximity);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof window === "undefined") {
          if (!cancelled) setHydrated(true);
          return;
        }
        const shared = readShareFromHash();
        if (shared) {
          applyShared(shared);
          clearShareFromUrl();
          if (!cancelled) setHydrated(true);
          return;
        }
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          const s = JSON.parse(raw);
          if (typeof s.age1 === "number") setAge1(s.age1);
          if (typeof s.income1 === "number") setIncome1(s.income1);
          if (typeof s.age2 === "number") setAge2(s.age2);
          if (typeof s.income2 === "number") setIncome2(s.income2);
          if (typeof s.existingDebt1 === "number") setExistingDebt1(s.existingDebt1);
          else if (typeof s.existingDebt === "number") { setExistingDebt1(s.existingDebt); setExistingDebt2(0); }
          if (typeof s.existingDebt2 === "number") setExistingDebt2(s.existingDebt2);
          if (typeof s.cash1 === "number") setCash1(s.cash1);
          else if (typeof s.cash === "number") { setCash1(s.cash); setCash2(0); }
          if (typeof s.cash2 === "number") setCash2(s.cash2);
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
          if (typeof s.loanType === "string") setLoanType(s.loanType);
          if (typeof s.firstTimer === "boolean") setFirstTimer(s.firstTimer);
          if (typeof s.flatType === "string") setFlatType(s.flatType);
          if (typeof s.proximity === "string") setProximity(s.proximity);
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

  // Listen for hashchange so pasting a share URL into an already-open tab
  // applies the encoded settings (the mount effect alone misses this case).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      const shared = readShareFromHash();
      if (!shared) return;
      applyShared(shared);
      clearShareFromUrl();
      setSaveStatus("shared-loaded");
      setTimeout(() => setSaveStatus(null), 2000);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const saveAsDefaults = async () => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          buyerMode,
          age1, income1, age2, income2,
          existingDebt1, existingDebt2, cash1, cash2, cpf1, cpf2,
          tenure, propertyOrder, propertyType, residency1, residency2, stressRate, marketRate, ltvTarget, absdRemission,
          loanType, firstTimer, flatType, proximity,
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
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm(
        "Reset all settings to factory defaults? Your saved defaults will be cleared."
      );
      if (!ok) return;
    }
    setBuyerMode(FACTORY_DEFAULTS.buyerMode);
    setAge1(FACTORY_DEFAULTS.age1);
    setIncome1(FACTORY_DEFAULTS.income1);
    setAge2(FACTORY_DEFAULTS.age2);
    setIncome2(FACTORY_DEFAULTS.income2);
    setExistingDebt1(FACTORY_DEFAULTS.existingDebt1);
    setExistingDebt2(FACTORY_DEFAULTS.existingDebt2);
    setCash1(FACTORY_DEFAULTS.cash1);
    setCash2(FACTORY_DEFAULTS.cash2);
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
    setLoanType(FACTORY_DEFAULTS.loanType);
    setFirstTimer(FACTORY_DEFAULTS.firstTimer);
    setFlatType(FACTORY_DEFAULTS.flatType);
    setProximity(FACTORY_DEFAULTS.proximity);
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

  const shareLink = async () => {
    try {
      const url = encodeShareUrl({
        age1, income1, age2, income2,
        existingDebt1, existingDebt2, cash1, cash2, cpf1, cpf2,
        tenure, propertyOrder, stressRate, marketRate, ltvTarget,
        propertyType, buyerMode, residency1, residency2, absdRemission,
        loanType, firstTimer, flatType, proximity,
      });
      await navigator.clipboard.writeText(url);
      setSaveStatus("shared");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      // Clipboard blocked — silently no-op (matches saveAsDefaults posture).
    }
  };

  const c = useMemo(() => {
    const income2Eff = buyerMode === "solo" ? 0 : income2;
    const age2Eff = buyerMode === "solo" ? 0 : age2;
    const cpf2Eff = (buyerMode === "solo" || residency2 === "foreigner") ? 0 : cpf2;
    const cpf1Eff = residency1 === "foreigner" ? 0 : cpf1;
    const cash2Eff = buyerMode === "solo" ? 0 : cash2;
    const existingDebt2Eff = buyerMode === "solo" ? 0 : existingDebt2;

    const totalIncome = income1 + income2Eff;
    const totalCash = Math.max(0, cash1 + cash2Eff);
    const totalCPF = Math.max(0, cpf1Eff + cpf2Eff);
    const totalFunds = totalCash + totalCPF;
    const totalExistingDebt = existingDebt1 + existingDebt2Eff;

    // Loan-mode constraints (private bank | HDB Concessionary | HDB bank).
    const params = loanParams({ propertyType, loanType });
    const effectiveStressRate = Math.max(stressRate, params.stressFloor);
    const effectiveTenure = Math.min(tenure, params.tenureCap);

    // TDSR
    const tdsrCap = 0.55 * totalIncome;
    const availableForMortgageTdsr = Math.max(0, tdsrCap - totalExistingDebt);
    // MSR (HDB only): 30% of gross household income caps the monthly mortgage.
    const msrCap = isHdb ? 0.30 * totalIncome : Infinity;
    const availableForMortgage = Math.min(availableForMortgageTdsr, msrCap);
    const msrBinds = isHdb && msrCap < availableForMortgageTdsr;
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
    else if (fundsBinds && incomeAtCapAtMax) bottleneck = msrBinds ? "msr+funds" : "income+funds";
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
    const monthlyAtStress = monthlyPayment(loan, effectiveTenure, effectiveStressRate / 100);
    const monthlyAtMarket = monthlyPayment(loan, effectiveTenure, marketRate / 100);

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
    const reverseMonthly = monthlyPayment(reverseLoan, effectiveTenure, effectiveStressRate / 100);
    const reverseLTV = p > 0 ? reverseLoan / p : 0;

    const reqIncome = (reverseMonthly + totalExistingDebt) / 0.55;
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
      effectiveTenure,
      effectiveStressRate,
      tenureClamped: tenure > params.tenureCap,
      stressRateClamped: stressRate < params.stressFloor,
      tenureCap: params.tenureCap,
      stressFloor: params.stressFloor,
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
      totalExistingDebt,
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
      msrBinds,
      msrCap,
    };
  }, [
    buyerMode, absdRemission,
    age1, age2, income1, income2, existingDebt1, existingDebt2, cash1, cash2, cpf1, cpf2,
    tenure, propertyOrder, residency1, residency2, stressRate, marketRate, targetOverride, ltvTarget,
    propertyType, loanType,
  ]);

  const bottleneckLabel = {
    "income+funds": "Income + cash/CPF",
    "msr+funds": "Limited by MSR + funds",
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

      <div className="max-w-[1400px] mx-auto px-5 py-10 md:py-14">
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
            Private Property
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
                role="status"
                aria-live="polite"
                className="text-[10px] italic text-stone-500 leading-relaxed"
                style={{ fontFamily: '"Fraunces", serif' }}
              >
                {saveStatus === "saved"
                  ? "✓ Saved as your defaults"
                  : saveStatus === "reset"
                  ? "↻ Restored factory values"
                  : saveStatus === "shared"
                  ? "✓ Link copied to clipboard"
                  : saveStatus === "shared-loaded"
                  ? "✓ Loaded shared settings"
                  : savedHasDefaults
                  ? "Loaded from your saved defaults"
                  : "Using factory defaults"}
              </div>
              <div className="flex items-center gap-2">
                <div
                  role="group"
                  aria-label="Settings actions"
                  className="inline-flex items-stretch"
                  style={{ border: "1px solid #D9D2BF" }}
                >
                  <button
                    type="button"
                    onClick={resetToFactory}
                    aria-label="Reset to factory defaults"
                    title="Reset to factory defaults"
                    className="inline-flex items-center justify-center w-9 h-9 hover:bg-[#F4EFE2] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ color: "#6B6357", outlineColor: "#1B4332" }}
                  >
                    <RotateCcwIcon />
                  </button>
                  <span
                    aria-hidden="true"
                    style={{ width: 1, background: "#D9D2BF" }}
                  />
                  <button
                    type="button"
                    onClick={shareLink}
                    aria-label="Copy shareable link"
                    title="Copy shareable link"
                    className="inline-flex items-center justify-center w-9 h-9 hover:bg-[#F4EFE2] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ color: "#6B6357", outlineColor: "#1B4332" }}
                  >
                    <LinkIcon />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={saveAsDefaults}
                  aria-label="Save current settings as defaults"
                  title="Save current settings as defaults"
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderColor: "#1B4332",
                    background: "#1B4332",
                    color: "#FAF7EE",
                    fontWeight: 600,
                    outlineColor: "#1B4332",
                  }}
                >
                  <BookmarkIcon />
                  Save
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
              <div className={buyerMode === "solo" ? "" : "grid grid-cols-2 gap-4"}>
                <div className="space-y-3">
                  <p className="text-xs text-stone-600 italic" style={{ fontFamily: '"Fraunces", serif' }}>
                    {buyerMode === "solo" ? "Buyer" : "Spouse 1"}
                  </p>
                  <NumberInput
                    label="Cash savings"
                    value={cash1}
                    onChange={setCash1}
                    prefix="S$"
                    hint="for downpayment, BSD, fees"
                  />
                  <NumberInput
                    label="Existing monthly debts"
                    value={existingDebt1}
                    onChange={setExistingDebt1}
                    prefix="S$"
                    hint="car loans, credit cards"
                  />
                </div>
                {buyerMode === "joint" && (
                  <div className="space-y-3">
                    <p className="text-xs text-stone-600 italic" style={{ fontFamily: '"Fraunces", serif' }}>
                      Spouse 2
                    </p>
                    <NumberInput
                      label="Cash savings"
                      value={cash2}
                      onChange={setCash2}
                      prefix="S$"
                      hint="for downpayment, BSD, fees"
                    />
                    <NumberInput
                      label="Existing monthly debts"
                      value={existingDebt2}
                      onChange={setExistingDebt2}
                      prefix="S$"
                      hint="car loans, credit cards"
                    />
                  </div>
                )}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                  {[
                    { v: "condo", label: "Condo / Apt" },
                    { v: "landed", label: "Landed" },
                    { v: "hdb_bto", label: "HDB BTO" },
                    { v: "hdb_resale", label: "HDB Resale" },
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
              </div>

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
                {c.tenureClamped && (
                  <p
                    className="text-[10px] italic text-[#A04C2D] mt-1"
                    style={{ fontFamily: '"Fraunces", serif' }}
                  >
                    Capped at {c.tenureCap}y for this loan type.
                  </p>
                )}
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
                      ? targetOverride !== null && c.target >= c.maxPrice - 1
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
                  sublabel={`covers ${fmt(c.reverseMonthly + c.totalExistingDebt)}/mo of debt @ 55% TDSR`}
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
