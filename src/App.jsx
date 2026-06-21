import { useEffect, useMemo, useState } from "react";

const DEFAULT_SHEET_URL =
  "https://opensheet.elk.sh/10A8amXj7QMzCfByz3Craq5dTnqwabD-0eN2v7ppoIsc/Expense";

const SHEET_URL = import.meta.env.VITE_SHEET_URL || DEFAULT_SHEET_URL;

const DEFAULT_MONTHLY_BUDGET = 50000;
const BUDGET_STORAGE_KEY = "finance-dashboard-monthly-budget";
const LOCAL_TX_STORAGE_KEY = "finance-dashboard-local-transactions";
const CUSTOM_SHEET_ID_KEY = "finance-dashboard-custom-sheet-id";
const CUSTOM_SHEET_NAME_KEY = "finance-dashboard-custom-sheet-name";
const CUSTOM_SHEET_ACTIVE_KEY = "finance-dashboard-custom-sheet-active";
const CUSTOM_APPS_SCRIPT_URL_KEY = "finance-dashboard-apps-script-url";
const CATEGORY_BUDGETS_KEY = "finance-dashboard-category-budgets";
const THEME_KEY = "finance-dashboard-theme";

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
});

const shortMonthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
});

function parseAmount(value) {
  const numeric = Number(String(value ?? "0").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDate(value) {
  if (!value) return null;

  const raw = String(value).trim();

  // Try matching YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Try matching DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Try matching DD-MM-YY or DD/MM/YY (2-digit year)
  const dmy2Match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (dmy2Match) {
    const [, day, month, year] = dmy2Match;
    const fullYear = `20${year}`;
    const parsed = new Date(Number(fullYear), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Fallback to standard Date parsing for text formats (e.g., "June 10")
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  return null;
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeTransaction(tx, index) {
  const txKeys = Object.keys(tx || {});
  const findKey = (candidates) => {
    const found = txKeys.find((k) => candidates.includes(k.toLowerCase()));
    return found ? tx[found] : undefined;
  };

  const rawDate = findKey(["date"]);
  const rawExpense = findKey(["expense", "item", "name", "title"]);
  const rawAmount = findKey(["amount", "price", "cost"]);
  const rawCategory = findKey(["category", "type", "tag"]);
  const rawPaymentType = findKey(["paymenttype", "payment type", "payment_type", "payment", "mode", "method"]);

  const date = parseDate(rawDate);

  return {
    id: `${rawDate ?? "unknown"}-${rawExpense ?? "expense"}-${rawAmount ?? index}-${index}`,
    amount: parseAmount(rawAmount),
    category: rawCategory?.trim() || "Other",
    date,
    dateLabel: rawDate || "No date",
    dayKey: date ? getDayKey(date) : "undated",
    name: rawExpense?.trim() || "Untitled expense",
    monthKey: date ? getMonthKey(date) : "undated",
    paymentType: rawPaymentType?.trim() || "NA",
    raw: tx,
  };
}

function sortByDateDesc(a, b) {
  return (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
}

function getStoredMonthlyBudget() {
  try {
    const stored = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (stored === null) return DEFAULT_MONTHLY_BUDGET;

    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MONTHLY_BUDGET;
  } catch {
    return DEFAULT_MONTHLY_BUDGET;
  }
}

function getStoredLocalTransactions() {
  try {
    const stored = localStorage.getItem(LOCAL_TX_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getStoredCustomSheetId() {
  try {
    return localStorage.getItem(CUSTOM_SHEET_ID_KEY) || "10A8amXj7QMzCfByz3Craq5dTnqwabD-0eN2v7ppoIsc";
  } catch {
    return "10A8amXj7QMzCfByz3Craq5dTnqwabD-0eN2v7ppoIsc";
  }
}

function getStoredCustomSheetName() {
  try {
    return localStorage.getItem(CUSTOM_SHEET_NAME_KEY) || "Expense";
  } catch {
    return "Expense";
  }
}

function getStoredAppsScriptUrl() {
  try {
    return localStorage.getItem(CUSTOM_APPS_SCRIPT_URL_KEY) || "https://script.google.com/macros/s/AKfycbzcOkQpQ3mTBZkSRIe42BvhS5WjM691o4jAwGKZM69BWc3y0EulqcGokO94O9ndDHUhYQ/exec";
  } catch {
    return "https://script.google.com/macros/s/AKfycbzcOkQpQ3mTBZkSRIe42BvhS5WjM691o4jAwGKZM69BWc3y0EulqcGokO94O9ndDHUhYQ/exec";
  }
}

function getStoredCustomSheetActive() {
  try {
    const val = localStorage.getItem(CUSTOM_SHEET_ACTIVE_KEY);
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

function extractSpreadsheetId(input) {
  const clean = String(input || "").trim();
  const match = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : clean;
}

function getStoredCategoryBudgets() {
  try {
    const stored = localStorage.getItem(CATEGORY_BUDGETS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

const fmt = (n) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pct = (val, total) => ((val / total) * 100).toFixed(1);

/* Emojis and Form numbers dictionary for custom categories loaded from Google Sheets */
const categoryMap = {
  investments: { emoji: "🏦", form: "壱ノ型", englishForm: "First Form" },
  investment: { emoji: "🏦", form: "壱ノ型", englishForm: "First Form" },
  transport: { emoji: "🚗", form: "弐ノ型", englishForm: "Second Form" },
  travel: { emoji: "🚗", form: "弐ノ型", englishForm: "Second Form" },
  emi: { emoji: "🚗", form: "弐ノ型", englishForm: "Second Form" },
  groceries: { emoji: "🛒", form: "参ノ型", englishForm: "Third Form" },
  grocery: { emoji: "🛒", form: "参ノ型", englishForm: "Third Form" },
  utilities: { emoji: "💡", form: "四ノ型", englishForm: "Fourth Form" },
  utility: { emoji: "💡", form: "四ノ型", englishForm: "Fourth Form" },
  bills: { emoji: "💡", form: "四ノ型", englishForm: "Fourth Form" },
  bill: { emoji: "💡", form: "四ノ型", englishForm: "Fourth Form" },
  dryfruits: { emoji: "🌰", form: "伍ノ型", englishForm: "Fifth Form" },
  snacks: { emoji: "🌰", form: "伍ノ型", englishForm: "Fifth Form" },
  food: { emoji: "🍽️", form: "六ノ型", englishForm: "Sixth Form" },
  dining: { emoji: "🍽️", form: "六ノ型", englishForm: "Sixth Form" },
  health: { emoji: "💊", form: "漆ノ型", englishForm: "Seventh Form" },
  medical: { emoji: "💊", form: "漆ノ型", englishForm: "Seventh Form" },
  pharmacy: { emoji: "💊", form: "漆ノ型", englishForm: "Seventh Form" }
};

const kanjiForms = ["壱ノ型", "弐ノ型", "参ノ型", "四ノ型", "伍ノ型", "六ノ型", "漆ノ型", "捌ノ型", "玖ノ型", "拾ノ型"];

function getCategoryDetails(name, index) {
  const clean = String(name || "").toLowerCase().trim();
  for (const key of Object.keys(categoryMap)) {
    if (clean.includes(key)) {
      return categoryMap[key];
    }
  }
  const formIndex = index % kanjiForms.length;
  return {
    emoji: "⚔️",
    form: kanjiForms[formIndex],
    englishForm: `Form ${formIndex + 1}`
  };
}

/* ═══════════════════════════════════════
   THEMES
═══════════════════════════════════════ */
const THEMES = {
  zenitsu: {
    id: "zenitsu",
    name: "ZENITSU",
    nameJP: "善逸",
    breathing: "雷の呼吸",
    breathingEN: "THUNDER BREATHING",
    form: "壱ノ型 · 霹靂一閃",
    formEN: "THUNDERCLAP AND FLASH",
    quote: "I can do it... when I'm asleep.",
    bg: "#07070f",
    panel: "#0d0d1a",
    raised: "#12121e",
    border: "#1a1a2c",
    primary: "#FFD700",
    secondary: "#FFA040",
    accent: "#AAFF44",
    glow: "#FFD700",
    dim: "#8a8ab0",
    muted: "#686895",
    kanji: "雷",
    haoriColor1: "#FFD700",
    haoriColor2: "#0a0a14",
    haoriAngle: "90deg",
    bladeColor: "#FFD700",
    catColors: ["#FFD700","#FFA040","#AAFF44","#66DDFF","#FF8844","#FF66BB","#44FFCC"],
    switchBg: "linear-gradient(135deg,#FFD700,#FFA040)",
    switchText: "#0a0a14",
  },
  tanjiro: {
    id: "tanjiro",
    name: "TANJIRO",
    nameJP: "炭治郎",
    breathing: "水の呼吸",
    breathingEN: "WATER BREATHING",
    form: "壱ノ型 · 水面斬り",
    formEN: "SURFACE SLASH",
    quote: "I will never give up. I will never stop.",
    bg: "#050d10",
    panel: "#08151a",
    raised: "#0d1f26",
    border: "#112830",
    primary: "#00AADD",
    secondary: "#006688",
    accent: "#00FFCC",
    glow: "#00CCFF",
    dim: "#7093a0",
    muted: "#4e707d",
    kanji: "水",
    haoriColor1: "#CC0000",
    haoriColor2: "#111",
    haoriAngle: "45deg",
    bladeColor: "#222",
    catColors: ["#00AADD","#0066AA","#00FFCC","#4488FF","#00DD88","#44AAFF","#00EE99"],
    switchBg: "linear-gradient(135deg,#00AADD,#006688)",
    switchText: "#ffffff",
  },
};

/* ═══════════════════════════════════════
   SVG COMPONENTS
═══════════════════════════════════════ */

const Katana = ({ width = 260, color = "#FFD700", glowing = false, secondary = "#FFA040" }) => (
  <svg width={width} height={36} viewBox="0 0 260 36" fill="none"
    style={{ filter: glowing ? `drop-shadow(0 0 7px ${color}) drop-shadow(0 0 20px ${color}88)` : `drop-shadow(0 0 3px ${color}55)` }}>
    <path d="M28 16 L240 13 L252 17 L240 21 L28 18 Z" fill={`url(#blade-${color.replace('#','')})`}/>
    <path d="M28 15 L240 12 L252 17" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6" fill="none"/>
    <path d="M48 17 L225 16.5" stroke="rgba(0,0,0,0.3)" strokeWidth="0.7"/>
    <path d="M240 13 L258 17 L240 21 Z" fill={color} opacity="0.9"/>
    <ellipse cx="28" cy="17" rx="4.5" ry="9" fill="#6B4F0A" stroke={secondary} strokeWidth="0.8"/>
    <ellipse cx="28" cy="17" rx="2.5" ry="6" fill="#4a3508"/>
    <circle cx="28" cy="17" r="1.5" fill={color} opacity="0.8"/>
    <rect x="20" y="13" width="8" height="8" rx="1" fill="#C0A030" stroke={color} strokeWidth="0.4"/>
    <path d="M4 11 L20 12 L20 22 L4 23 Z" fill="#14080a" stroke="#2a1010" strokeWidth="0.5"/>
    {[5,8,11,14,17].map(x=>(
      <path key={x} d={`M${x} 11 L${x+0.8} 23`} stroke={color} strokeWidth="1.4" opacity="0.7"/>
    ))}
    <ellipse cx="4" cy="17" rx="2.5" ry="5.5" fill="#8B6914" stroke={color} strokeWidth="0.7"/>
    <path d="M40 15 L44 13 L42 16.5 L47 14.5 L44 18.5" stroke={color} strokeWidth="0.7" opacity="0.55"/>
    <defs>
      <linearGradient id={`blade-${color.replace('#','')}`} x1="28" y1="13" x2="240" y2="21" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={color} stopOpacity="0.95"/>
        <stop offset="40%" stopColor="#fff" stopOpacity="0.9"/>
        <stop offset="70%" stopColor={color} stopOpacity="0.85"/>
        <stop offset="100%" stopColor={color} stopOpacity="0.65"/>
      </linearGradient>
    </defs>
  </svg>
);

const TanjiroKatana = ({ width = 260, glowing = false }) => (
  <svg width={width} height={36} viewBox="0 0 260 36" fill="none"
    style={{ filter: glowing ? `drop-shadow(0 0 7px #00AADD) drop-shadow(0 0 20px #00AADD88)` : `drop-shadow(0 0 4px #00AADD44)` }}>
    <path d="M28 16 L240 13 L252 17 L240 21 L28 18 Z" fill="url(#tanjiroBlade)"/>
    <path d="M28 15 L240 12 L252 17" stroke="rgba(0,180,255,0.35)" strokeWidth="0.8" fill="none"/>
    <path d="M48 17 L225 16.5" stroke="rgba(0,180,255,0.15)" strokeWidth="0.7"/>
    <path d="M240 13 L258 17 L240 21 Z" fill="#1a1a2e" opacity="0.95"/>
    {[60,100,140,180].map(x=>(
      <path key={x} d={`M${x} 14.5 Q${x+10} 12 ${x+20} 14.5 Q${x+30} 17 ${x+20} 19.5 Q${x+10} 22 ${x} 19.5`}
        stroke="#00AADD" strokeWidth="0.5" fill="none" opacity="0.25"/>
    ))}
    <ellipse cx="28" cy="17" rx="4.5" ry="9" fill="#1a0a0a" stroke="#880000" strokeWidth="1.2"/>
    <ellipse cx="28" cy="17" rx="2.5" ry="6" fill="#100505"/>
    <circle cx="28" cy="17" r="1.5" fill="#CC0000" opacity="0.9"/>
    <rect x="20" y="13" width="8" height="8" rx="1" fill="#880000" stroke="#CC0000" strokeWidth="0.4"/>
    <path d="M4 11 L20 12 L20 22 L4 23 Z" fill="#050505"/>
    {[5,7,9,11,13,15,17,19].map((x,i)=>(
      <rect key={x} x={x} y={i%2===0?11:14} width="2" height="3" fill={i%2===0?"#CC0000":"#111"} opacity="0.7"/>
    ))}
    <ellipse cx="4" cy="17" rx="2.5" ry="5.5" fill="#440000" stroke="#CC0000" strokeWidth="0.7"/>
    <defs>
      <linearGradient id="tanjiroBlade" x1="28" y1="13" x2="240" y2="21" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#111" stopOpacity="1"/>
        <stop offset="30%" stopColor="#1a2a3a" stopOpacity="1"/>
        <stop offset="60%" stopColor="#0a1a2a" stopOpacity="1"/>
        <stop offset="100%" stopColor="#050d14" stopOpacity="1"/>
      </linearGradient>
    </defs>
  </svg>
);

const MiniKatana = ({ color = "#FFD700", size = 70 }) => (
  <svg width={size} height={12} viewBox="0 0 70 12" fill="none"
    style={{ filter:`drop-shadow(0 0 3px ${color}77)` }}>
    <path d="M7 5 L62 4 L68 6 L62 8 L7 7 Z" fill={color} opacity="0.85"/>
    <path d="M62 4 L70 6 L62 8 Z" fill={color}/>
    <ellipse cx="7" cy="6" rx="2.5" ry="5" fill="#4a3508" stroke={color} strokeWidth="0.5"/>
    <rect x="1" y="3.5" width="6" height="5" rx="0.5" fill="#14080a"/>
    {[2,4,6].map(x=><line key={x} x1={x} y1="3.5" x2={x+0.5} y2="8.5" stroke={color} strokeWidth="1" opacity="0.6"/>)}
  </svg>
);

const Kunai = ({ color = "#888", size = 30, rotate = 0 }) => (
  <svg width={size} height={size * 2.2} viewBox="0 0 24 52" fill="none"
    style={{ transform:`rotate(${rotate}deg)`, filter:`drop-shadow(0 0 3px ${color}55)` }}>
    <path d="M12 2 L15.5 16 L12 18 L8.5 16 Z" fill={color} opacity="0.9"/>
    <path d="M12 2 L12.8 16" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5"/>
    <rect x="7" y="16" width="10" height="3" rx="1" fill="#444" stroke="#666" strokeWidth="0.4"/>
    <rect x="10" y="19" width="4" height="16" rx="1" fill="#1a1a1a"/>
    {[21,24,27,30,33].map(y=><line key={y} x1="10" y1={y} x2="14" y2={y} stroke={color} strokeWidth="0.8" opacity="0.6"/>)}
    <circle cx="12" cy="40" r="4.5" fill="none" stroke="#666" strokeWidth="1.4"/>
    <circle cx="12" cy="40" r="2" fill="none" stroke="#444" strokeWidth="0.8"/>
    <path d="M12 44.5 Q10.5 47.5 12 51 Q13.5 47.5 12 44.5" stroke="#6B3A1A" strokeWidth="1.2" fill="none"/>
  </svg>
);

const Bolt = ({ size = 22, color = "#FFD700", glow = false }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 22 30" fill="none">
    {glow && <ellipse cx="11" cy="15" rx="9" ry="13" fill={color + "18"}/>}
    <path d="M14 2L4 17H11L8 28L19 12H12L14 2Z" fill={color}
      style={{ filter: glow ? `drop-shadow(0 0 5px ${color})` : "none" }}/>
  </svg>
);

const WaterWave = ({ color = "#00AADD", width = 260, opacity = 0.5 }) => (
  <svg width={width} height={24} viewBox={`0 0 ${width} 24`} fill="none" style={{ opacity }}>
    <path d={`M0 12 Q${width*.1} 4 ${width*.2} 12 Q${width*.3} 20 ${width*.4} 12 Q${width*.5} 4 ${width*.6} 12 Q${width*.7} 20 ${width*.8} 12 Q${width*.9} 4 ${width} 12`}
      stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d={`M0 16 Q${width*.12} 8 ${width*.25} 16 Q${width*.38} 24 ${width*.5} 16 Q${width*.62} 8 ${width*.75} 16 Q${width*.88} 24 ${width} 16`}
      stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.5"/>
  </svg>
);

const CorpsMark = ({ size = 28, color = "#FFD700", opacity = 0.85 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" style={{ opacity }}>
    <circle cx="18" cy="18" r="16" stroke={color} strokeWidth="1.2" fill="none"/>
    <line x1="5" y1="31" x2="31" y2="5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="31" y1="31" x2="5" y2="5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <ellipse cx="18" cy="18" rx="3" ry="4" fill="#4a3000" stroke={color} strokeWidth="0.7"/>
    <circle cx="18" cy="18" r="1.4" fill={color}/>
    {[0,90,180,270].map(a=>(
      <circle key={a} cx={18+14*Math.cos(a*Math.PI/180)} cy={18+14*Math.sin(a*Math.PI/180)} r="1.8" fill={color} opacity="0.55"/>
    ))}
  </svg>
);

const Droplet = ({ size = 18, color = "#00AADD", opacity = 0.7 }) => (
  <svg width={size} height={size * 1.3} viewBox="0 0 18 24" fill="none" style={{ opacity }}>
    <path d="M9 1 Q16 10 16 15 A7 7 0 0 1 2 15 Q2 10 9 1 Z" fill={color} opacity="0.7"/>
    <path d="M9 6 Q13 12 13 15 A4 4 0 0 1 5 15 Q5 12 9 6 Z" fill="rgba(255,255,255,0.25)"/>
  </svg>
);

const Wisteria = ({ size = 16, opacity = 0.4 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ opacity }}>
    <ellipse cx="10" cy="6" rx="2.5" ry="4" fill="#9966CC"/>
    <ellipse cx="5.5" cy="9" rx="2.5" ry="3.5" fill="#AA77DD" transform="rotate(-25 5.5 9)"/>
    <ellipse cx="14.5" cy="9" rx="2.5" ry="3.5" fill="#AA77DD" transform="rotate(25 14.5 9)"/>
    <ellipse cx="7.5" cy="15" rx="2" ry="3" fill="#BB88EE" transform="rotate(-15 7.5 15)"/>
    <ellipse cx="12.5" cy="15" rx="2" ry="3" fill="#BB88EE" transform="rotate(15 12.5 15)"/>
  </svg>
);

/* ═══════════════════════════════════════
   THEME SWITCHER BUTTON
═══════════════════════════════════════ */
const ThemeSwitcher = ({ current, onChange }) => {
  const other = current === "zenitsu" ? THEMES.tanjiro : THEMES.zenitsu;
  const cur = THEMES[current];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"8px",
      background:"#0a0a12", border:`1px solid ${cur.primary}33`,
      borderRadius:"40px", padding:"4px", boxShadow:`0 0 20px ${cur.primary}22` }}>
      <div style={{ padding:"7px 14px", borderRadius:"36px",
        background:cur.switchBg, color:cur.switchText,
        fontFamily:"'Inter', sans-serif", fontSize:"10px",
        fontWeight:700, letterSpacing:"1.5px",
        boxShadow:`0 0 12px ${cur.primary}55`,
        display:"flex", alignItems:"center", gap:"6px" }}>
        {current === "zenitsu"
          ? <Bolt size={12} color={cur.switchText}/>
          : <Droplet size={10} color={cur.switchText} opacity={1}/>}
        {cur.nameJP} {cur.name}
      </div>
      <button onClick={() => onChange(other.id)}
        className="sw-other"
        style={{ padding:"7px 14px", borderRadius:"36px",
          background:"transparent", color:other.primary,
          fontFamily:"'Inter', sans-serif", fontSize:"10px",
          fontWeight:600, letterSpacing:"1.5px",
          border:`1px solid ${other.primary}44`,
          cursor:"pointer", transition:"all .2s",
          display:"flex", alignItems:"center", gap:"6px" }}>
        {other.id === "zenitsu"
          ? <Bolt size={12} color={other.primary}/>
          : <Droplet size={10} color={other.primary} opacity={1}/>}
        {other.nameJP} {other.name}
      </button>
    </div>
  );
};

function getSlayerRank(budgetRemaining, monthlyBudget) {
  if (monthlyBudget <= 0) return { rank: "Mizunoto", title: "Mizunoto (癸)", desc: "Lowest Slayer Rank", color: "#6a6a9a" };
  const percent = (budgetRemaining / monthlyBudget) * 100;
  if (budgetRemaining < 0) {
    return { rank: "Demon", title: "Demon (鬼)", desc: "Lost budget control!", color: "#ff4444" };
  } else if (percent >= 85) {
    return { rank: "Hashira", title: "Hashira (柱)", desc: "Pillar of Budget Control", color: "#FFD700" };
  } else if (percent >= 60) {
    return { rank: "Kinoe", title: "Kinoe (甲)", desc: "Senior Slayer", color: "#FFA040" };
  } else if (percent >= 30) {
    return { rank: "Kanoe", title: "Kanoe (庚)", desc: "Intermediate Slayer", color: "#AAFF44" };
  } else {
    return { rank: "Mizunoto", title: "Mizunoto (癸)", desc: "Lowest Slayer Rank", color: "#688a9a" };
  }
}

/* ═══════════════════════════════════════
   MAIN APPLICATION
═══════════════════════════════════════ */
export default function App() {
  const base = import.meta.env.BASE_URL || "/";
  const zenitsuBg = `${base}zenitsu-bg.png`;
  const tanjiroBg = `${base}tanjiro-bg.png`;

  const [transactions, setTransactions] = useState([]);
  const [localTransactions, setLocalTransactions] = useState(getStoredLocalTransactions);
  const [expanded, setExpanded] = useState({});
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState(getStoredMonthlyBudget);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  // Custom Sheet Connection States
  const [customSheetId, setCustomSheetId] = useState(getStoredCustomSheetId);
  const [customSheetName, setCustomSheetName] = useState(getStoredCustomSheetName);
  const [customAppsScriptUrl, setCustomAppsScriptUrl] = useState(getStoredAppsScriptUrl);
  const [isCustomActive, setIsCustomActive] = useState(getStoredCustomSheetActive);
  const [isConnectorOpen, setIsConnectorOpen] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState(() => {
    const storedId = getStoredCustomSheetId();
    return storedId ? `https://docs.google.com/spreadsheets/d/${storedId}/edit` : "https://docs.google.com/spreadsheets/d/10A8amXj7QMzCfByz3Craq5dTnqwabD-0eN2v7ppoIsc/edit";
  });
  const [sheetTabInput, setSheetTabInput] = useState(getStoredCustomSheetName);
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState(getStoredAppsScriptUrl);
  const [connectorStatus, setConnectorStatus] = useState("idle"); // idle, checking, success, error
  const [connectorError, setConnectorError] = useState("");
  const [lastSynced, setLastSynced] = useState(null);

  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const triggerRefetch = () => setRefetchTrigger(prev => prev + 1);

  // Upgrade Feature States
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return stored === "tanjiro" ? "tanjiro" : "zenitsu";
    } catch {
      return "zenitsu";
    }
  });
  const [categoryBudgets, setCategoryBudgets] = useState(getStoredCategoryBudgets);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingBudgetVal, setEditingBudgetVal] = useState("");

  // Sandbox Simulator Form States
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  const [newExpenseDate, setNewExpenseDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [newExpensePaymentType, setNewExpensePaymentType] = useState("UPI");
  const [isCustomPaymentType, setIsCustomPaymentType] = useState(false);
  const [customPaymentType, setCustomPaymentType] = useState("");
  const [switching, setSwitching] = useState(false);

  // New Premium App States
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, forms, analytics, forge
  const [isSlashPlaying, setIsSlashPlaying] = useState(false);
  const [slashTriggerTheme, setSlashTriggerTheme] = useState("zenitsu");
  const [toast, setToast] = useState({ show: false, message: "", type: "info" });

  const showToast = (message, type = "info") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  const triggerSlashAnimation = () => {
    setSlashTriggerTheme(theme);
    setIsSlashPlaying(true);
    setTimeout(() => {
      setIsSlashPlaying(false);
    }, 600); // match animation duration
  };

  const T = THEMES[theme];

  // Sync state effects
  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(CATEGORY_BUDGETS_KEY, JSON.stringify(categoryBudgets));
  }, [categoryBudgets]);

  useEffect(() => {
    localStorage.setItem(BUDGET_STORAGE_KEY, String(monthlyBudget));
  }, [monthlyBudget]);

  useEffect(() => {
    localStorage.setItem(LOCAL_TX_STORAGE_KEY, JSON.stringify(localTransactions));
  }, [localTransactions]);

  useEffect(() => {
    let isMounted = true;

    async function loadTransactions() {
      try {
        setStatus("loading");
        setError("");

        const fetchUrl = isCustomActive && customSheetId.trim()
          ? `https://opensheet.elk.sh/${customSheetId.trim()}/${customSheetName.trim() || "Expense"}`
          : SHEET_URL;

        const response = await fetch(fetchUrl);

        if (!response.ok) {
          throw new Error(
            response.status === 404 && isCustomActive
              ? "Sheet tab not found or Spreadsheet is private. Make sure access is 'Anyone with the link can view'."
              : `Sheet request failed: ${response.status}`
          );
        }

        const data = await response.json();

        if (!isMounted) return;

        setTransactions(data.map(normalizeTransaction).sort(sortByDateDesc));
        setLastSynced(new Date());
        setStatus("ready");
      } catch (fetchError) {
        if (!isMounted) return;

        setError(fetchError.message || "Unable to load expenses.");
        setStatus("error");
      }
    }

    loadTransactions();

    return () => {
      isMounted = false;
    };
  }, [customSheetId, customSheetName, isCustomActive, refetchTrigger]);

  const combinedTransactions = useMemo(() => {
    const normalizedLocal = localTransactions.map((tx, index) =>
      normalizeTransaction(tx, `local-${index}`)
    );
    return [...transactions, ...normalizedLocal].sort(sortByDateDesc);
  }, [transactions, localTransactions]);

  const monthOptions = useMemo(() => {
    const options = new Map();

    combinedTransactions.forEach((tx) => {
      if (!tx.date) return;
      options.set(tx.monthKey, monthFormatter.format(tx.date));
    });

    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [combinedTransactions]);

  const activeMonth = selectedMonth || monthOptions[0]?.value || "";

  const monthlyTransactions = useMemo(() => {
    if (!activeMonth) return [];
    return combinedTransactions.filter((tx) => tx.monthKey === activeMonth);
  }, [activeMonth, combinedTransactions]);

  const categoryOptions = useMemo(() => {
    return [...new Set(monthlyTransactions.map((tx) => tx.category))].sort();
  }, [monthlyTransactions]);

  const visibleTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return monthlyTransactions.filter((tx) => {
      const matchesCategory =
        selectedCategory === "all" || tx.category === selectedCategory;
      const matchesQuery =
        !normalizedQuery ||
        `${tx.name} ${tx.category} ${tx.dateLabel} ${tx.paymentType || "NA"}`.toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [monthlyTransactions, query, selectedCategory]);

  const groupedCategories = useMemo(() => {
    const grouped = visibleTransactions.reduce((acc, tx) => {
      acc[tx.category] ??= [];
      acc[tx.category].push(tx);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, items]) => {
        const total = items.reduce((sum, tx) => sum + tx.amount, 0);

        return {
          items,
          name,
          total,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [visibleTransactions]);

  const dailySpend = useMemo(() => {
    const grouped = monthlyTransactions.reduce((acc, tx) => {
      if (!tx.date) return acc;
      acc[tx.dayKey] ??= { date: tx.date, total: 0 };
      acc[tx.dayKey].total += tx.amount;
      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => a.date - b.date);
  }, [monthlyTransactions]);

  const monthlySpend = useMemo(() => {
    const grouped = combinedTransactions.reduce((acc, tx) => {
      if (!tx.date) return acc;
      acc[tx.monthKey] ??= {
        date: new Date(tx.date.getFullYear(), tx.date.getMonth(), 1),
        key: tx.monthKey,
        total: 0,
        transactions: 0,
      };
      acc[tx.monthKey].total += tx.amount;
      acc[tx.monthKey].transactions += 1;
      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => a.date - b.date);
  }, [combinedTransactions]);

  const totalSpent = visibleTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const monthlyTotal = monthlyTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const highestDay = dailySpend.reduce(
    (best, day) => (day.total > best.total ? day : best),
    { total: 0, date: null },
  );
  const maxDailySpend = Math.max(...dailySpend.map((day) => day.total), 1);
  const maxMonthlySpend = Math.max(...monthlySpend.map((month) => month.total), 1);
  const currentMonthLabel =
    monthOptions.find((month) => month.value === activeMonth)?.label || "Select a month";
  const budgetUsed = monthlyBudget > 0 ? (monthlyTotal / monthlyBudget) * 100 : 0;
  const budgetRemaining = monthlyBudget - monthlyTotal;

  const slayerRank = useMemo(() => {
    return getSlayerRank(budgetRemaining, monthlyBudget);
  }, [budgetRemaining, monthlyBudget]);

  // --- UPGRADE: PREDICTIVE METRICS & SPENDING VELOCITY ---
  const { dailyAllowanceRemaining, daysRemaining } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    const isCurrentMonth = activeMonth === currentMonthKey;
    let elapsed = 30;
    let totalDays = 30;

    if (activeMonth) {
      const [year, month] = activeMonth.split("-").map(Number);
      totalDays = new Date(year, month, 0).getDate();
      elapsed = isCurrentMonth ? Math.min(now.getDate(), totalDays) : totalDays;
    }

    const remaining = totalDays - elapsed;

    const budgetLeft = Math.max(0, monthlyBudget - monthlyTotal);
    const dailyAllowance = remaining > 0 ? budgetLeft / remaining : 0;

    return {
      dailyAllowanceRemaining: dailyAllowance,
      daysRemaining: remaining,
    };
  }, [activeMonth, monthlyTotal, monthlyBudget]);

  const resetFilters = () => {
    setQuery("");
    setSelectedCategory("all");
    setExpanded({});
  };

  const updateMonthlyBudget = (value) => {
    const nextBudget = Math.max(0, Number(value) || 0);
    setMonthlyBudget(nextBudget);
  };

  const toggle = (id) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleConnectSheet = async (e) => {
    e.preventDefault();
    setConnectorStatus("checking");
    setConnectorError("");

    const extractedId = extractSpreadsheetId(sheetUrlInput);
    const tabName = sheetTabInput.trim() || "Expense";

    if (!extractedId) {
      setConnectorStatus("error");
      setConnectorError("Invalid Google Sheet URL or ID. Please check the URL.");
      return;
    }

    const testUrl = `https://opensheet.elk.sh/${extractedId}/${tabName}`;

    try {
      const response = await fetch(testUrl);
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Sheet tab not found or Spreadsheet is private. Make sure access is 'Anyone with the link can view'."
            : `Failed to load sheet: HTTP ${response.status}`
        );
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("Fetched data is not in an expected list format.");
      }

      if (data.length === 0) {
        throw new Error("Sheet is empty! Please add some transactions first.");
      }

      const sample = data[0];
      const keys = Object.keys(sample).map(k => k.toLowerCase());

      const hasDate = keys.includes("date");
      const hasAmount = keys.includes("amount") || keys.includes("price") || keys.includes("cost");
      const hasExpense = keys.includes("expense") || keys.includes("item") || keys.includes("name") || keys.includes("title");

      if (!hasDate || !hasAmount || !hasExpense) {
        throw new Error(
          "Column verification failed. The sheet must contain columns for Date, Amount, and Expense/Item."
        );
      }

      setCustomSheetId(extractedId);
      setCustomSheetName(tabName);
      setCustomAppsScriptUrl(appsScriptUrlInput.trim());
      setIsCustomActive(true);

      localStorage.setItem(CUSTOM_SHEET_ID_KEY, extractedId);
      localStorage.setItem(CUSTOM_SHEET_NAME_KEY, tabName);
      localStorage.setItem(CUSTOM_APPS_SCRIPT_URL_KEY, appsScriptUrlInput.trim());
      localStorage.setItem(CUSTOM_SHEET_ACTIVE_KEY, "true");

      setConnectorStatus("success");

      setTimeout(() => {
        setIsConnectorOpen(false);
        setConnectorStatus("idle");
      }, 1500);
    } catch (err) {
      setConnectorStatus("error");
      setConnectorError(err.message || "Failed to verify sheet. Please check the link and sharing settings.");
    }
  };

  const handleResetToDemo = () => {
    setIsCustomActive(false);
    localStorage.setItem(CUSTOM_SHEET_ACTIVE_KEY, "false");
    setConnectorStatus("idle");
    setConnectorError("");
    setSheetUrlInput("");
    setSheetTabInput("Expense");
    setAppsScriptUrlInput("");
    setCustomAppsScriptUrl("");
    localStorage.removeItem(CUSTOM_APPS_SCRIPT_URL_KEY);
  };

  const handleSaveCategoryBudget = (categoryName) => {
    const nextBudget = Math.max(0, Number(editingBudgetVal) || 0);
    setCategoryBudgets((prev) => ({
      ...prev,
      [categoryName]: nextBudget,
    }));
    setEditingCategory(null);
    setEditingBudgetVal("");
  };

  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!newExpenseName.trim() || !newExpenseAmount) return;

    const finalCategory = isCustomCategory ? customCategory.trim() : newExpenseCategory;
    if (!finalCategory) {
      showToast("Please select or enter a category.", "warning");
      return;
    }

    const parts = newExpenseDate.split("-");
    const localDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(localDate);

    const expenseText = newExpenseName.trim();
    const amountVal = Number(newExpenseAmount);

    const finalPaymentType = isCustomPaymentType ? customPaymentType.trim() : newExpensePaymentType;
    if (!finalPaymentType) {
      showToast("Please select or enter a payment type.", "warning");
      return;
    }

    const newTx = {
      id: `local-${Date.now()}`,
      Expense: expenseText,
      Amount: String(amountVal),
      Category: finalCategory,
      Date: formattedDate,
      PaymentType: finalPaymentType,
    };

    if (isCustomActive && customAppsScriptUrl.trim()) {
      try {
        setIsSubmittingExpense(true);
        const response = await fetch(customAppsScriptUrl.trim(), {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "text/plain"
          },
          body: JSON.stringify({
            date: formattedDate,
            expense: expenseText,
            amount: amountVal,
            category: finalCategory,
            paymentType: finalPaymentType
          })
        });

        let result = null;
        try {
          result = await response.json();
        } catch {
          // If response parsing fails, it's fine as long as standard redirects are followed
        }

        if (response.ok || (result && result.status === "success")) {
          triggerSlashAnimation();
          showToast("Strike logged to Google Sheet!", "success");
          
          setNewExpenseName("");
          setNewExpenseAmount("");
          setCustomCategory("");
          setIsCustomCategory(false);
          setCustomPaymentType("");
          setIsCustomPaymentType(false);
          triggerRefetch();
        } else {
          throw new Error("Invalid Apps Script response");
        }
      } catch (postError) {
        console.error("Sync Error:", postError);
        const proceedLocal = window.confirm(
          "\u{274C} Failed to sync to Google Sheet. Web App URL might be incorrect or access is restricted.\n\nWould you like to save it locally only for now?"
        );
        if (proceedLocal) {
          setLocalTransactions((prev) => [newTx, ...prev]);
          triggerSlashAnimation();
          showToast("Strike simulated locally", "success");
          setNewExpenseName("");
          setNewExpenseAmount("");
          setCustomCategory("");
          setIsCustomCategory(false);
          setCustomPaymentType("");
          setIsCustomPaymentType(false);
        }
      } finally {
        setIsSubmittingExpense(false);
      }
    } else {
      setLocalTransactions((prev) => [newTx, ...prev]);
      triggerSlashAnimation();
      showToast("Strike simulated locally", "success");
      setNewExpenseName("");
      setNewExpenseAmount("");
      setCustomCategory("");
      setIsCustomCategory(false);
      setCustomPaymentType("");
      setIsCustomPaymentType(false);
    }
  };

  const clearLocalTransactions = () => {
    if (window.confirm("Are you sure you want to clear all locally added transactions?")) {
      setLocalTransactions([]);
    }
  };

  const exportToCSV = () => {
    const headers = ["Date", "Expense", "Amount", "Category", "PaymentType"];
    const rows = visibleTransactions.map((tx) => [
      tx.dateLabel,
      `"${tx.name.replace(/"/g, '""')}"`,
      tx.amount,
      `"${tx.category.replace(/"/g, '""')}"`,
      `"${(tx.paymentType || "NA").replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `finance_report_${activeMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSwitch = (id) => {
    setSwitching(true);
    setTimeout(() => { setTheme(id); setSwitching(false); }, 320);
  };

  const bgKunais = [
    { left:"4%",  top:"18%", rotate:30,  size:26, op:0.06 },
    { left:"92%", top:"12%", rotate:-45, size:22, op:0.05 },
    { left:"88%", top:"55%", rotate:60,  size:20, op:0.06 },
    { left:"6%",  top:"70%", rotate:-20, size:24, op:0.05 },
    { left:"50%", top:"6%",  rotate:15,  size:18, op:0.04 },
  ];

  const [monthWord, yearWord] = useMemo(() => {
    if (!currentMonthLabel || currentMonthLabel === "Select a month") {
      return ["SELECT", "MONTH"];
    }
    const parts = currentMonthLabel.split(" ");
    return [parts[0].toUpperCase(), parts[1] || ""];
  }, [currentMonthLabel]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700;900&family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

        @keyframes slideIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeSwitch{0%{opacity:0;transform:scale(.97)}100%{opacity:1;transform:scale(1)}}
        @keyframes flashOut{0%{opacity:1}50%{opacity:0}100%{opacity:1}}
        @keyframes pulsePrimary{
          0%,100%{filter:drop-shadow(0 0 6px var(--pc)) drop-shadow(0 0 16px var(--pc2));opacity:.85}
          50%{filter:drop-shadow(0 0 18px var(--pc)) drop-shadow(0 0 38px var(--pc2));opacity:1}
        }
        @keyframes katanaDraw{
          0%{clip-path:inset(0 100% 0 0)}
          100%{clip-path:inset(0 0% 0 0)}
        }
        @keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes wisteriaDrift{
          0%,100%{transform:translateY(0) rotate(0deg);opacity:.3}
          50%{transform:translateY(-12px) rotate(10deg);opacity:.55}
        }
        @keyframes waterFlow{
          0%{transform:translateX(0)}
          100%{transform:translateX(-50%)}
        }
        @keyframes thunderFlash{
          0%,80%,100%{opacity:0}
          82%{opacity:.9}
          85%{opacity:.05}
          87%{opacity:.7}
          90%{opacity:0}
        }
        @keyframes haoriStripe{0%,100%{transform:scaleX(1)}50%{transform:scaleX(1.01)}}
        @keyframes scanline{0%{top:-2px}100%{top:100vh}}
        @keyframes bladeShine{0%{left:-100%}40%{left:120%}100%{left:120%}}
        @keyframes dropletFall{
          0%{transform:translateY(-20px);opacity:0}
          10%{opacity:.8}
          90%{opacity:.6}
          100%{transform:translateY(100vh);opacity:0}
        }
        .ds-card:hover{background:var(--raised-h)!important;border-color:var(--pc-c)!important}
        .ds-card:hover .kunai-wm{opacity:.14!important}
        .ds-card:hover .card-shine{animation:bladeShine 1.1s ease forwards!important}
        .sw-other:hover{background:var(--sw-other-bg)!important;color:#0a0a14!important}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{border-radius:4px}

        @keyframes swordSlash {
          0% { transform: scaleX(0) rotate(-15deg); opacity: 0; }
          15% { transform: scaleX(1.2) rotate(-15deg); opacity: 1; }
          80% { transform: scaleX(1) rotate(-15deg); opacity: 1; filter: brightness(1.5) blur(0px); }
          100% { transform: scaleX(1) rotate(-15deg); opacity: 0; filter: brightness(2) blur(8px); }
        }
        @keyframes screenFlash {
          0% { background: transparent; }
          10% { background: rgba(255, 255, 255, 0.85); }
          20% { background: rgba(255, 255, 255, 0.15); }
          90% { background: rgba(255, 255, 255, 0.05); }
          100% { background: transparent; }
        }
        @keyframes shakeScreen {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-4px, 4px); }
          30% { transform: translate(4px, -4px); }
          50% { transform: translate(-2px, -2px); }
          70% { transform: translate(2px, 2px); }
        }
        .slash-overlay {
          animation: screenFlash 0.5s ease-out forwards;
        }
        .slash-line {
          position: absolute;
          width: 140%;
          height: 6px;
          transform: rotate(-15deg);
          box-shadow: 0 0 20px 8px var(--pc);
          background: #ffffff;
          animation: swordSlash 0.5s ease-out forwards;
        }
        .slash-active-zenitsu .slash-line {
          background: #fff;
          box-shadow: 0 0 25px 12px #FFD700, 0 0 10px 4px #FFF;
        }
        .slash-active-tanjiro .slash-line {
          background: #fff;
          box-shadow: 0 0 25px 12px #00AADD, 0 0 10px 4px #FFF;
        }
        .shake-container {
          animation: shakeScreen 0.4s ease-out forwards;
        }

        @keyframes toastIn {
          from { transform: translate(-50%, -20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        .toast-notification {
          animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideInUp {
          from { transform: translate(-50%, 40px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        .bottom-nav-bar {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          width: 420px;
          max-width: calc(100% - 32px);
          height: 64px;
          background: rgba(10, 10, 18, 0.75);
          backdrop-filter: blur(16px) saturate(190%);
          -webkit-backdrop-filter: blur(16px) saturate(190%);
          border: 1px solid var(--pc-c);
          border-radius: 20px;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.6), 0 0 12px var(--pc2);
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 0 12px;
          z-index: 900;
          transition: all 0.4s ease;
          animation: slideInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .nav-tab-btn {
          background: transparent;
          border: none;
          outline: none;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          padding: 6px 12px;
          border-radius: 12px;
          color: #8888aa;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        .nav-tab-btn-active {
          color: #ffffff !important;
          transform: translateY(-2px);
          text-shadow: 0 0 8px var(--pc);
        }
        .nav-tab-btn-active::after {
          content: "";
          position: absolute;
          bottom: 2px;
          width: 14px;
          height: 3px;
          background: var(--pc);
          border-radius: 2px;
          box-shadow: 0 0 8px var(--pc);
          animation: pulsePrimary 2s infinite;
        }
        .nav-tab-btn:hover {
          color: #ffffff;
          transform: translateY(-1px);
        }
      `}</style>

      <div className={isSlashPlaying ? "shake-container" : ""} style={{
        "--pc": T.primary, "--pc2": T.primary+"66",
        "--raised-h": T.raised, "--pc-c": T.primary+"55",
        "--sw-other-bg": T.primary,
        minHeight:"100vh", background:T.bg,
        display:"flex", justifyContent:"center",
        fontFamily:"'Plus Jakarta Sans', sans-serif",
        position:"relative", overflowX:"hidden", overflowY:"auto",
        transition:"background .5s ease",
        opacity: switching ? 0 : 1,
        animation: switching ? "none" : "fadeSwitch .4s ease",
      }}>

        {/* ═══ BACKGROUND ═══ */}
        <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, overflow:"hidden" }}>

          {/* Haori stripe borders */}
          {[0,"calc(100% - 6px)"].map((top,i) => (
            <div key={i} style={{ position:"absolute", top, left:0, right:0, height:"6px",
              background:`repeating-linear-gradient(${T.haoriAngle},${T.haoriColor1} 0,${T.haoriColor1} 14px,${T.haoriColor2} 14px,${T.haoriColor2} 28px)`,
              opacity: i===0 ? 0.6 : 0.35, animation:"haoriStripe 5s ease-in-out infinite",
              transition:"background .5s" }}/>
          ))}

          {/* Giant kanji bg */}
          <div style={{ position:"absolute", top:"50%", left:"50%",
            transform:"translate(-50%,-50%)",
            fontFamily:"'Noto Serif JP',serif",
            fontSize:"320px", color:T.primary,
            opacity:0.04, lineHeight:1, userSelect:"none",
            animation:"pulsePrimary 5s ease-in-out infinite",
            transition:"color .5s" }}>
            {T.kanji}
          </div>

          {/* BG kunai */}
          {bgKunais.map((k,i) => (
            <div key={i} style={{ position:"absolute", left:k.left, top:k.top,
              opacity:k.op, animation:`floatY ${3+i}s ${i*.5}s ease-in-out infinite` }}>
              <Kunai color={T.primary+"55"} size={k.size} rotate={k.rotate}/>
            </div>
          ))}

          {/* ZENITSU: bolt flashes */}
          {theme === "zenitsu" && [{ left:"14%", delay:"3s" },{ left:"82%", delay:"7.5s" }].map((b,i)=>(
            <div key={i} style={{ position:"absolute", left:b.left, top:0, opacity:0,
              animation:`thunderFlash 9s ${b.delay} ease-in-out infinite` }}>
              <Bolt size={42} color="#FFD700" glow/>
            </div>
          ))}

          {/* TANJIRO: falling droplets */}
          {theme === "tanjiro" && Array.from({length:16},(_,i)=>i).map(i=>(
            <div key={i} style={{ position:"absolute",
              left:`${(i*7.3+Math.sin(i)*12)%100}%`, top:0,
              animation:`dropletFall ${2+i*.4}s ${i*.35}s linear infinite`,
              opacity:0 }}>
              <Droplet size={10+(i%3)*4} color="#00AADD" opacity={0.15+i%3*.08}/>
            </div>
          ))}

          {/* Wisteria */}
          {[{l:"8%",t:"25%",d:"0s"},{l:"86%",t:"32%",d:"1.4s"},{l:"45%",t:"7%",d:".7s"},{l:"72%",t:"78%",d:"2.1s"},{l:"18%",t:"85%",d:"1.8s"}]
            .map((w,i)=>(
            <div key={i} style={{ position:"absolute", left:w.l, top:w.t,
              animation:`wisteriaDrift ${4+i}s ${w.d} ease-in-out infinite` }}>
              <Wisteria size={16} opacity={0.28}/>
            </div>
          ))}

          {/* TANJIRO: scrolling water waves */}
          {theme === "tanjiro" && (
            <>
              <div style={{ position:"absolute", bottom:"120px", left:0, width:"200%",
                animation:"waterFlow 8s linear infinite", opacity:0.08 }}>
                <WaterWave color="#00AADD" width={1000} opacity={1}/>
              </div>
              <div style={{ position:"absolute", bottom:"80px", left:0, width:"200%",
                animation:"waterFlow 12s linear infinite reverse", opacity:0.06 }}>
                <WaterWave color="#00CCFF" width={1000} opacity={1}/>
              </div>
            </>
          )}

          {/* Scanline */}
          <div style={{ position:"absolute", left:0, right:0, height:"2px",
            background:`linear-gradient(90deg,transparent,${T.primary}06,transparent)`,
            animation:"scanline 10s linear infinite" }}/>

          {/* Atmosphere */}
          <div style={{ position:"absolute", top:"-80px", left:"50%", transform:"translateX(-50%)",
            width:"600px", height:"400px", borderRadius:"50%",
            background:`radial-gradient(ellipse,${T.primary}10,transparent 65%)`,
            transition:"background .5s" }}/>
        </div>

        {/* ══════════ MAIN ══════════ */}
        <div style={{ width:"100%", maxWidth:"480px", padding:"28px 18px 80px",
          position:"relative", zIndex:1 }}>

          {/* ── THEME SWITCHER ── */}
          <div style={{ display:"flex", justifyContent:"center",
            marginBottom:"20px", animation:"slideIn .4s ease both" }}>
            <ThemeSwitcher current={theme} onChange={handleSwitch}/>
          </div>

          {/* ── CONNECTION ROW ── */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap", animation: "slideIn .45s .02s ease both" }}>
            {/* Connection Pill */}
            <button
              onClick={() => setIsConnectorOpen(true)}
              title="Click to manage connection settings"
              type="button"
              style={{
                flex: 1,
                background: T.panel,
                border: `1px solid ${T.primary}22`,
                borderRadius: "12px",
                padding: "8px 12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#d0cce8",
                fontFamily: "'Inter', sans-serif",
                fontSize: "10px",
                letterSpacing: "1px",
                transition: "all 0.3s ease",
                textAlign: "left"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = T.primary;
                e.currentTarget.style.boxShadow = `0 0 10px ${T.primary}22`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${T.primary}22`;
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <span style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: status === "loading" ? T.secondary : status === "error" ? "#ff4444" : isCustomActive ? T.accent : T.primary,
                boxShadow: `0 0 8px ${status === "loading" ? T.secondary : status === "error" ? "#ff4444" : isCustomActive ? T.accent : T.primary}`,
                display: "inline-block",
                animation: status === "loading" ? "pulsePrimary 1.5s infinite" : "none"
              }} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ color: T.primary, fontWeight: 700, fontSize: "8px" }}>
                  LEDGER SYNC {status === "loading" && " (SYNCING...)"}
                </span>
                <span>{isCustomActive ? `${customSheetName}` : "Demo Sheet Mode"}</span>
                {status === "ready" && lastSynced && (
                  <span style={{ fontSize: "7px", color: T.dim, marginTop: "1px" }}>
                    Synced {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </button>

            {/* Connect Button */}
            <button
              onClick={() => setIsConnectorOpen(true)}
              type="button"
              style={{
                background: T.switchBg,
                color: T.switchText,
                border: "none",
                borderRadius: "12px",
                padding: "8px 16px",
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "1px",
                boxShadow: `0 0 12px ${T.primary}44`,
                transition: "all 0.3s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = "brightness(1.1)";
                e.currentTarget.style.boxShadow = `0 0 18px ${T.primary}66`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "none";
                e.currentTarget.style.boxShadow = `0 0 12px ${T.primary}44`;
              }}
            >
              ⚔️ SYNC CENTER
            </button>
          </div>

          {/* ── HEADER ── */}
          <div style={{ marginBottom:"24px", animation:"slideIn .55s .04s ease both" }}>

            {/* Top badge row */}
            <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"16px" }}>
              <div style={{ width:"36px", height:"36px", borderRadius:"9px",
                background:T.switchBg,
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow:`0 0 18px ${T.primary}88`, flexShrink:0,
                transition:"background .5s" }}>
                {theme==="zenitsu"
                  ? <Bolt size={17} color="#0a0a14"/>
                  : <Droplet size={16} color="#fff" opacity={1}/>}
              </div>
              <span style={{ fontFamily:"'Inter', sans-serif", fontSize:"9px",
                letterSpacing:"2.5px", color:T.primary,
                padding:"3px 12px", border:`1px solid ${T.primary}44`,
                borderRadius:"20px", background:`${T.primary}10`,
                transition:"color .5s, border-color .5s, background .5s" }}>
                {T.breathingEN}
              </span>
              <div style={{ marginLeft:"auto",
                animation:"pulsePrimary 3s ease-in-out infinite",
                transition:"color .5s" }}>
                <CorpsMark size={30} color={T.primary}/>
              </div>
            </div>

            {/* ── HERO WEAPON PANEL ── */}
            <div style={{ position:"relative", 
              background: T.panel,
              border:`1px solid ${T.primary}22`, borderRadius:"16px",
              padding:"24px 20px", marginBottom:"16px",
              overflow:"hidden", transition:"all .5s ease" }}>

              {/* Wallpaper Background Div (Mirrored horizontally for perfect layout framing) */}
              <div style={{
                position: "absolute",
                inset: 0,
                backgroundImage: theme === "zenitsu" ? `url(${zenitsuBg})` : `url(${tanjiroBg})`,
                backgroundSize: "cover",
                backgroundPosition: "center 28%",
                transform: "scaleX(-1)", // Mirror horizontally so character face is on the right side
                zIndex: 0,
                transition: "background-image .5s ease"
              }} />

              {/* Glassmorphic Gradient Overlay (Darker on the left for text contrast, clear on the right for face visibility) */}
              <div style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(90deg, rgba(10, 12, 22, 0.94) 0%, rgba(10, 12, 22, 0.7) 55%, rgba(10, 12, 22, 0) 100%)`,
                zIndex: 1
              }} />

              {/* Top glow line */}
              <div style={{ position:"absolute", top:0, left:0, right:0, height:"2px",
                background:`linear-gradient(90deg,transparent,${T.primary},transparent)`,
                zIndex: 2, transition:"background .5s" }}/>

              {/* Haori pattern bg overlay */}
              <div style={{ position:"absolute", inset:0,
                background:`repeating-linear-gradient(${T.haoriAngle},${T.primary}07 0,${T.primary}07 16px,transparent 16px,transparent 32px)`,
                zIndex: 2, transition:"background .5s" }}/>

              {/* Left-Aligned Header Content */}
              <div style={{ textAlign: "left", position: "relative", zIndex: 3, padding: "0 10px" }}>
                <p style={{ margin: "0 0 6px", fontFamily: "'Noto Serif JP',serif",
                  fontSize: "11px", color: `${T.primary}aa`, letterSpacing: "4px",
                  transition: "color .5s" }}>
                  鬼殺隊 · {T.breathing}
                </p>

                {/* MAIN BLADE */}
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "12px",
                  animation: "katanaDraw 1.2s .2s ease-out both" }}>
                  {theme === "zenitsu"
                    ? <Katana width={200} color={T.primary} secondary={T.secondary} glowing={true}/>
                    : <TanjiroKatana width={200} glowing={true}/>}
                </div>

                {/* Dynamic character name + month */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", margin: "4px 0" }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "10px", color: T.muted, letterSpacing: "3px", fontWeight: 700 }}>
                    ERA · {yearWord}
                  </span>
                  <h1 style={{ margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: "44px", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-0.5px" }}>
                    <span style={{ color: T.primary,
                      textShadow: `0 0 24px ${T.primary}aa, 0 0 50px ${T.primary}55`,
                      transition: "color .5s, text-shadow .5s" }}>
                      {monthWord}
                    </span>
                  </h1>
                </div>

                <p style={{ margin: "6px 0", fontFamily: "'Inter', sans-serif",
                  fontSize: "9px", color: T.dim, letterSpacing: "2px", textTransform: "uppercase",
                  transition: "color .5s", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                  <span>{T.nameJP} · {T.name}</span>
                  <span style={{ color: T.primary }}>•</span>
                  <span>RANK: <strong style={{ color: slayerRank.color, textShadow: `0 0 8px ${slayerRank.color}88` }}>{slayerRank.title}</strong></span>
                </p>

                <p style={{ margin: "0 0 6px", fontFamily: "'Noto Serif JP',serif",
                  fontSize: "12px", color: `${T.primary}77`, letterSpacing: "3px",
                  transition: "color .5s" }}>
                  {T.form}
                </p>

                <p style={{ margin: "10px 0 0", fontFamily: "'Inter', sans-serif",
                  fontSize: "11.5px", color: T.dim, fontStyle: "italic", lineHeight: "1.4", maxWidth: "260px",
                  transition: "color .5s" }}>
                  "{T.quote}"
                </p>

                {/* Interactive Month Selector */}
                <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "16px", marginBottom: "4px" }}>
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "8px", color: `${T.primary}66`, letterSpacing: "1px" }}>SELECT ERA / MONTH</span>
                    <select
                      value={activeMonth}
                      onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        resetFilters();
                      }}
                      disabled={monthOptions.length === 0}
                      style={{
                        background: T.raised,
                        color: T.primary,
                        border: `1px solid ${T.primary}33`,
                        borderRadius: "8px",
                        padding: "5px 10px",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: "10px",
                        letterSpacing: "1.5px",
                        cursor: "pointer",
                        outline: "none",
                        transition: "all 0.3s",
                        boxShadow: `0 0 10px ${T.primary}11`
                      }}
                    >
                      {monthOptions.map((month) => (
                        <option key={month.value} value={month.value} style={{ background: T.raised, color: "#fff" }}>
                          {month.label.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <div style={{ flex:1, height:"1px",
                background:`linear-gradient(90deg,transparent,${T.primary}44)`,
                transition:"background .5s" }}/>
              {theme==="zenitsu" ? <Bolt size={12} color={`${T.primary}77`}/> : <Droplet size={10} color={`${T.primary}77`} opacity={0.8}/>}
              <MiniKatana color={T.primary} size={55}/>
              {theme==="zenitsu" ? <Bolt size={12} color={`${T.primary}77`}/> : <Droplet size={10} color={`${T.primary}77`} opacity={0.8}/>}
              <div style={{ flex:1, height:"1px",
                background:`linear-gradient(90deg,${T.primary}44,transparent)`,
                transition:"background .5s" }}/>
            </div>
          </div>

          {/* ── STATE PANELS ── */}
          {status === "loading" && (
            <div style={{
              background: T.panel,
              border: `1px solid ${T.primary}44`,
              borderRadius: "14px",
              padding: "30px",
              textAlign: "center",
              color: T.primary,
              fontFamily: "'Inter', sans-serif",
              fontSize: "14px",
              letterSpacing: "1.5px",
              boxShadow: `0 0 15px ${T.primary}22`,
              marginBottom: "20px"
            }}>
              <span style={{ display: "inline-block", animation: "pulsePrimary 1.5s infinite", fontSize: "20px", marginBottom: "10px" }}>🌀</span>
              <div>LOADING FINANCIAL STRIKES...</div>
            </div>
          )}

          {status === "error" && (
            <div style={{
              background: T.panel,
              border: "1px solid #ff444466",
              borderRadius: "14px",
              padding: "24px 20px",
              textAlign: "center",
              color: "#ff4444",
              boxShadow: "0 0 15px rgba(255, 68, 68, 0.15)",
              marginBottom: "20px"
            }}>
              <strong style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "16px", display: "block", marginBottom: "6px" }}>
                SYNC ERROR OCCURRED
              </strong>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#d0cce8" }}>
                {error}
              </span>
            </div>
          )}

          {status === "ready" && (
            <>
              {/* ── SUMMARY CARDS ── */}
              {activeTab === "dashboard" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
                  gap:"10px", marginBottom:"20px", animation:"slideIn .55s .1s ease both" }}>
                  {[
                    { label:"TOTAL SPENT",  value:fmt(totalSpent), accent:T.primary },
                    { label:"FORMS USED",   value:groupedCategories.length, accent:T.secondary },
                    { label:"STRIKES",      value:visibleTransactions.length, accent:T.accent },
                  ].map(({label,value,accent})=>(
                    <div key={label} style={{ position:"relative", background:T.panel,
                      border:`1px solid ${accent}28`, borderRadius:"14px",
                      padding:"16px 12px 14px", overflow:"hidden",
                      transition:"background .5s, border-color .5s" }}>
                      <div style={{ position:"absolute", top:0, left:0, right:0, height:"2px",
                        background:accent, opacity:.7 }}/>
                      <div style={{ position:"absolute", top:0, left:0, right:0, height:"60%",
                        background:`radial-gradient(ellipse at top,${accent}18,transparent 70%)` }}/>
                      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"5px",
                        background:`repeating-linear-gradient(${T.haoriAngle},${accent}44 0,${accent}44 8px,transparent 8px,transparent 16px)` }}/>
                      <div style={{ position:"absolute", bottom:"8px", right:"6px", opacity:.06 }}>
                        <MiniKatana color={accent} size={48}/>
                      </div>
                      <div style={{ fontFamily:"'Inter', sans-serif", fontWeight:700,
                        fontSize:"20px", color:accent,
                        textShadow:`0 0 16px ${accent}77`,
                        display:"block", marginBottom:"5px", position:"relative", zIndex:1,
                        transition:"color .5s, text-shadow .5s" }}>
                        {value}
                      </div>
                      <div style={{ fontSize:"8px", color:T.dim,
                        fontFamily:"'Inter', sans-serif",
                        letterSpacing:"1.5px", textTransform:"uppercase",
                        position:"relative", zIndex:1, transition:"color .5s" }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── INSIGHTS GRID ── */}
              {activeTab === "analytics" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1.1fr 0.9fr",
                  gap:"10px", marginBottom:"20px", animation:"slideIn .55s .12s ease both" }}>
                  
                  {/* Budget Pulse */}
                  <div style={{ position:"relative", background:T.panel,
                    border:`1px solid ${budgetRemaining < 0 ? "#ff4444" : T.primary}28`, borderRadius:"14px",
                    padding:"12px 10px", overflow:"hidden", display: "flex", flexDirection: "column", justifyContent: "space-between",
                    transition:"background .5s, border-color .5s" }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:"2px",
                      background: budgetRemaining < 0 ? "#ff4444" : T.primary, opacity:.7 }}/>
                    <div>
                      <span style={{ fontSize:"8px", color:T.dim, fontFamily:"'Inter', sans-serif", letterSpacing:"1px", textTransform:"uppercase" }}>
                        BUDGET PULSE
                      </span>
                      <div style={{ fontFamily:"'Inter', sans-serif", fontWeight:700,
                        fontSize:"15px", color: budgetRemaining < 0 ? "#ff4444" : T.primary,
                        textShadow:`0 0 12px ${budgetRemaining < 0 ? "#ff4444" : T.primary}55`,
                        marginTop: "2px", transition:"color .5s" }}>
                        {budgetRemaining < 0 ? `-${fmt(Math.abs(budgetRemaining))}` : fmt(budgetRemaining)}
                      </div>
                    </div>
                    <div style={{ fontSize:"8px", color: T.muted, fontFamily:"'Inter', sans-serif", marginTop: "6px" }}>
                      {budgetRemaining < 0 ? "Exceeded!" : `${budgetUsed.toFixed(0)}% Used`}
                    </div>
                  </div>

                  {/* Highest Day */}
                  <div style={{ position:"relative", background:T.panel,
                    border:`1px solid ${T.secondary}28`, borderRadius:"14px",
                    padding:"12px 10px", overflow:"hidden", display: "flex", flexDirection: "column", justifyContent: "space-between",
                    transition:"background .5s, border-color .5s" }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:"2px",
                      background:T.secondary, opacity:.7 }}/>
                    <div>
                      <span style={{ fontSize:"8px", color:T.dim, fontFamily:"'Inter', sans-serif", letterSpacing:"1px", textTransform:"uppercase" }}>
                        HIGHEST STRIKE
                      </span>
                      <div style={{ fontFamily:"'Inter', sans-serif", fontWeight:700,
                        fontSize:"14px", color:T.secondary,
                        textShadow:`0 0 12px ${T.secondary}55`,
                        marginTop: "2px", transition:"color .5s" }}>
                        {highestDay.date ? dayFormatter.format(highestDay.date) : "None"}
                      </div>
                    </div>
                    <div style={{ fontSize:"8px", color: T.muted, fontFamily:"'Inter', sans-serif", marginTop: "6px" }}>
                      {highestDay.total > 0 ? `${fmt(highestDay.total)} Spent` : "No strikes"}
                    </div>
                  </div>

                  {/* Daily Allowance */}
                  <div style={{ position:"relative", background:T.panel,
                    border:`1px solid ${T.accent}28`, borderRadius:"14px",
                    padding:"12px 10px", overflow:"hidden", display: "flex", flexDirection: "column", justifyContent: "space-between",
                    transition:"background .5s, border-color .5s" }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:"2px",
                      background:T.accent, opacity:.7 }}/>
                    <div>
                      <span style={{ fontSize:"8px", color:T.dim, fontFamily:"'Inter', sans-serif", letterSpacing:"1px", textTransform:"uppercase" }}>
                        ALLOWANCE
                      </span>
                      <div style={{ fontFamily:"'Inter', sans-serif", fontWeight:700,
                        fontSize:"14px", color:T.accent,
                        textShadow:`0 0 12px ${T.accent}55`,
                        marginTop: "2px", transition:"color .5s" }}>
                        {fmt(dailyAllowanceRemaining)}
                      </div>
                    </div>
                    <div style={{ fontSize:"8px", color: T.muted, fontFamily:"'Inter', sans-serif", marginTop: "6px" }}>
                      {daysRemaining} Days Left
                    </div>
                  </div>

                </div>
              )}

              {/* ── ALLOCATION BAR ── */}
              {activeTab === "dashboard" && (
                <div style={{ marginBottom:"24px", animation:"slideIn .55s .16s ease both" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"8px",
                    alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <MiniKatana color={`${T.primary}77`} size={28}/>
                      <span style={{ fontFamily:"'Inter', sans-serif", fontSize:"9px",
                        letterSpacing:"2px", color:`${T.primary}77`, textTransform:"uppercase",
                        transition:"color .5s" }}>
                        ENERGY DISTRIBUTION
                      </span>
                    </div>
                    <span style={{ fontFamily:"'Inter', sans-serif",
                      fontSize:"9px", color:T.muted, transition:"color .5s" }}>
                      {monthWord} {yearWord}
                    </span>
                  </div>
                  <div style={{ display:"flex", height:"10px", borderRadius:"5px",
                    overflow:"hidden", gap:"2px",
                    border:`1px solid ${T.primary}20`, background:"#040408",
                    transition:"border-color .5s" }}>
                    {groupedCategories.map((c,i)=>(
                      <div key={c.name} title={`${c.name}: ${fmt(c.total)}`}
                        style={{ height:"100%", borderRadius:"2px", flexShrink:0,
                          width:pct(c.total, totalSpent || 1)+"%",
                          background: T.catColors[i % T.catColors.length],
                          boxShadow:`0 0 8px ${T.catColors[i % T.catColors.length]}66`,
                          position:"relative", overflow:"hidden",
                          transition:"background .5s" }}>
                        <div style={{ position:"absolute", top:0, left:0, right:0, height:"40%",
                          background:"rgba(255,255,255,0.22)", borderRadius:"2px 2px 0 0" }}/>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", marginTop:"10px" }}>
                    {groupedCategories.map((c,i)=>(
                      <div key={c.name} style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                        <div style={{ width:"5px", height:"5px", borderRadius:"50%",
                          background: T.catColors[i % T.catColors.length],
                          boxShadow:`0 0 5px ${T.catColors[i % T.catColors.length]}88`,
                          transition:"background .5s" }}/>
                        <span style={{ fontSize:"9px", color:T.dim,
                          fontFamily:"'Inter', sans-serif",
                          transition:"color .5s" }}>
                          {c.name.split(" ")[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── RECENT STRIKES LOG ── */}
              {activeTab === "dashboard" && (
                <div style={{
                  background: T.panel,
                  border: `1px solid ${T.primary}22`,
                  borderRadius: "14px",
                  padding: "16px",
                  marginBottom: "20px",
                  animation: "slideIn 0.55s 0.18s ease both"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <MiniKatana color={`${T.primary}77`} size={28}/>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", letterSpacing: "2px", color: `${T.primary}77` }}>
                        RECENT STRIKES
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTab("forms")}
                      type="button"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: T.primary,
                        fontSize: "9px",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "'Inter', sans-serif",
                        letterSpacing: "1.5px"
                      }}
                    >
                      VIEW ALL ⚔️
                    </button>
                  </div>

                  {combinedTransactions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "16px", color: T.muted, fontSize: "11px", fontFamily: "'Inter', sans-serif" }}>
                      NO STRIKES LOGGED YET
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {combinedTransactions.slice(0, 5).map((tx, idx) => {
                        const catDetails = getCategoryDetails(tx.category, idx);
                        const cc = T.catColors[idx % T.catColors.length];
                        return (
                          <div key={tx.id} style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: T.raised,
                            border: `1px solid ${T.border}`,
                            borderRadius: "10px",
                            padding: "10px 12px"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontSize: "16px" }}>{catDetails.emoji}</span>
                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: "#d0cce8", fontFamily: "'Inter', sans-serif" }}>
                                  {tx.name}
                                </div>
                                <div style={{ fontSize: "9px", color: T.muted, fontFamily: "'Inter', sans-serif", marginTop: "1px" }}>
                                  {tx.dateLabel} • {tx.paymentType || "NA"} • <span style={{ color: cc }}>{tx.category}</span>
                                </div>
                              </div>
                            </div>
                            <span style={{ fontSize: "13px", fontWeight: 700, color: cc, fontFamily: "'Inter', sans-serif" }}>
                              {fmt(tx.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── FILTERS PANEL ── */}
              {activeTab === "forms" && (
                <>
                  <div style={{
                    background: T.panel,
                    border: `1px solid ${T.primary}22`,
                    borderRadius: "14px",
                    padding: "14px",
                    marginBottom: "20px",
                    animation: "slideIn .55s .18s ease both"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                      <MiniKatana color={`${T.primary}77`} size={28}/>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", letterSpacing: "2px", color: `${T.primary}77` }}>
                        STRIKE SEARCH & FILTERS
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Search input */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>SEARCH LOGS</span>
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Strike name, category, or date..."
                          style={{
                            background: T.raised,
                            color: "#fff",
                            border: `1px solid ${T.primary}22`,
                            borderRadius: "8px",
                            padding: "8px 12px",
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            fontSize: "12px",
                            outline: "none",
                            transition: "border-color 0.3s"
                          }}
                          onFocus={(e) => e.target.style.borderColor = T.primary}
                          onBlur={(e) => e.target.style.borderColor = `${T.primary}22`}
                        />
                      </div>

                      {/* Category Select & Actions */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", alignItems: "flex-end" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>BREATHING FORM</span>
                          <select
                            value={selectedCategory}
                            onChange={(e) => {
                              setSelectedCategory(e.target.value);
                              setExpanded({});
                            }}
                            style={{
                              background: T.raised,
                              color: "#fff",
                              border: `1px solid ${T.primary}22`,
                              borderRadius: "8px",
                              padding: "7px 10px",
                              fontFamily: "'Inter', sans-serif",
                              fontSize: "11px",
                              outline: "none",
                              cursor: "pointer"
                            }}
                          >
                            <option value="all" style={{ background: T.raised }}>ALL FORMS</option>
                            {categoryOptions.map((cat) => (
                              <option key={cat} value={cat} style={{ background: T.raised }}>
                                {cat.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Filter buttons */}
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={resetFilters}
                            type="button"
                            style={{
                              flex: 1,
                              background: "transparent",
                              color: T.primary,
                              border: `1px solid ${T.primary}44`,
                              borderRadius: "8px",
                              padding: "7px",
                              fontFamily: "'Inter', sans-serif",
                              fontSize: "10px",
                              cursor: "pointer",
                              transition: "all 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = `${T.primary}11`}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            RESET
                          </button>
                          <button
                            onClick={exportToCSV}
                            type="button"
                            disabled={visibleTransactions.length === 0}
                            style={{
                              flex: 1.2,
                              background: T.switchBg,
                              color: T.switchText,
                              border: "none",
                              borderRadius: "8px",
                              padding: "8px",
                              fontFamily: "'Inter', sans-serif",
                              fontSize: "10px",
                              fontWeight: 700,
                              cursor: "pointer",
                              opacity: visibleTransactions.length === 0 ? 0.4 : 1,
                              transition: "all 0.2s"
                            }}
                          >
                            EXPORT CSV
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── SECTION HEADER ── */}
                  <div style={{ display:"flex", alignItems:"center", gap:"8px",
                    marginBottom:"14px", animation:"slideIn .55s .22s ease both" }}>
                    <div style={{ flex:1, height:"1px",
                      background:`linear-gradient(90deg,transparent,${T.primary}33)`,
                      transition:"background .5s" }}/>
                    {theme==="zenitsu"
                      ? <Kunai color={`${T.primary}66`} size={13} rotate={-90}/>
                      : <Droplet size={11} color={`${T.primary}66`} opacity={0.8}/>}
                    <span style={{ fontFamily:"'Inter', sans-serif", fontSize:"9px",
                      letterSpacing:"2.5px", color:`${T.primary}66`,
                      textTransform:"uppercase", whiteSpace:"nowrap",
                      transition:"color .5s" }}>
                      BREATHING FORMS
                    </span>
                    {theme==="zenitsu"
                      ? <Kunai color={`${T.primary}66`} size={13} rotate={90}/>
                      : <Droplet size={11} color={`${T.primary}66`} opacity={0.8}/>}
                    <div style={{ flex:1, height:"1px",
                      background:`linear-gradient(90deg,${T.primary}33,transparent)`,
                      transition:"background .5s" }}/>
                    <span style={{ fontFamily:"'Inter', sans-serif",
                      fontSize:"9px", color:T.muted, marginLeft:"6px",
                      transition:"color .5s" }}>
                      {groupedCategories.length} forms
                    </span>
                  </div>

                  {/* ── CATEGORY CARDS ── */}
                  <div style={{ display:"flex", flexDirection:"column", gap:"10px", marginBottom:"40px" }}>
                    {groupedCategories.map((category, idx) => {
                      const isOpen = !!expanded[category.name];
                      const share = pct(category.total, totalSpent || 1);
                      const cc = T.catColors[idx % T.catColors.length];
                      
                      // Get dynamic emoji and breathing form details
                      const catDetails = getCategoryDetails(category.name, idx);
                      
                      const hasCatBudget = categoryBudgets[category.name] !== undefined && categoryBudgets[category.name] > 0;
                      const catBudgetVal = hasCatBudget ? categoryBudgets[category.name] : 0;
                      const catUsagePercent = hasCatBudget ? (category.total / catBudgetVal) * 100 : 0;

                      // Dynamic color based on budget status
                      let fillBg = cc;
                      if (hasCatBudget) {
                        if (catUsagePercent >= 90) fillBg = "#ff4444";
                        else if (catUsagePercent >= 70) fillBg = T.secondary;
                        else fillBg = T.accent;
                      }

                      return (
                        <div key={category.name} className="ds-card"
                          onClick={() => toggle(category.name)}
                          style={{
                            position:"relative",
                            background: isOpen ? T.raised : T.panel,
                            border:`1px solid ${isOpen ? cc+"55" : T.border}`,
                            borderRadius:"14px", overflow:"hidden",
                            cursor:"pointer",
                            transition:"border-color .25s, background .25s",
                            animation:`slideIn .5s ${.28+idx*.055}s ease both`,
                          }}>

                          {/* Haori stripe top */}
                          <div style={{ position:"absolute", top:0, left:0, right:0, height:"3px",
                            background:`repeating-linear-gradient(${T.haoriAngle},${cc} 0,${cc} 10px,transparent 10px,transparent 20px)`,
                            opacity: isOpen ? 0.8 : 0.3, transition:"opacity .25s, background .5s" }}/>

                          {/* Left strip */}
                          <div style={{ position:"absolute", left:0, top:"14%", bottom:"14%",
                            width:"3px", borderRadius:"0 3px 3px 0",
                            background:cc,
                            boxShadow:`0 0 10px ${cc}99, 0 0 22px ${cc}44`,
                            transition:"background .5s, box-shadow .5s" }}/>

                          {/* Kunai watermark */}
                          <div className="kunai-wm" style={{ position:"absolute", right:"6px", top:"6px",
                            opacity:0.06, transition:"opacity .2s",
                            transform:"rotate(-45deg)" }}>
                            <Kunai color={cc} size={20} rotate={0}/>
                          </div>

                          {/* Shine on hover */}
                          <div className="card-shine" style={{ position:"absolute", top:0, bottom:0,
                            width:"40%",
                            background:`linear-gradient(90deg,transparent,${cc}08,transparent)`,
                            left:"-100%", pointerEvents:"none" }}/>

                          {isOpen && (
                            <div style={{ position:"absolute", inset:0, pointerEvents:"none",
                              background:`radial-gradient(ellipse at top left,${cc}0e,transparent 55%)` }}/>
                          )}

                          <div style={{ padding:"14px 14px 14px 18px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between",
                              alignItems:"center", marginBottom:"10px" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                                <div style={{ width:"42px", height:"42px",
                                  background:T.raised, borderRadius:"10px",
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  fontSize:"19px", flexShrink:0,
                                  border:`1px solid ${cc}44`,
                                  boxShadow:`0 0 14px ${cc}30`,
                                  position:"relative", overflow:"hidden",
                                  transition:"background .5s, border-color .5s" }}>
                                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"5px",
                                    background:`repeating-linear-gradient(${T.haoriAngle},${cc}55 0,${cc}55 4px,transparent 4px,transparent 8px)` }}/>
                                  {catDetails.emoji}
                                </div>
                                <div>
                                  <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"2px" }}>
                                    <span style={{ fontSize:"14px", fontWeight:700, color:"#d0cce8",
                                      fontFamily:"'Plus Jakarta Sans', sans-serif", letterSpacing:"0.5px" }}>
                                      {category.name}
                                    </span>
                                    <span style={{ fontFamily:"'Noto Serif JP',serif",
                                      fontSize:"10px", color:cc+"88",
                                      padding:"1px 5px",
                                      border:`1px solid ${cc}30`,
                                      borderRadius:"4px",
                                      background:`${cc}0c`,
                                      transition:"color .5s, border-color .5s" }}>
                                      {catDetails.form}
                                    </span>
                                  </div>
                                  <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                                    <MiniKatana color={cc+"77"} size={28}/>
                                    <span style={{ fontSize:"10px",
                                      fontFamily:"'Inter', sans-serif",
                                      color:cc+"77", letterSpacing:"0.4px",
                                      transition:"color .5s" }}>
                                      {category.items.length} strikes · {share}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                                <span style={{ fontSize:"16px", fontWeight:700,
                                  fontFamily:"'Inter', sans-serif",
                                  color:cc, textShadow:`0 0 14px ${cc}aa`,
                                  transition:"color .5s, text-shadow .5s" }}>
                                  {fmt(category.total)}
                                </span>
                                <div style={{ width:"24px", height:"24px",
                                  border:`1px solid ${cc}44`, borderRadius:"6px",
                                  background:`${cc}0c`,
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  transition:"transform .25s, border-color .5s",
                                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                                  <span style={{ color:cc, fontSize:"13px", lineHeight:1,
                                    transition:"color .5s" }}>▾</span>
                                </div>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div style={{ height:"5px", background:T.border,
                              borderRadius:"3px", overflow:"hidden" }}>
                              <div style={{ height:"100%", borderRadius:"3px",
                                width:`${hasCatBudget ? Math.min(catUsagePercent, 100) : share}%`,
                                background: `linear-gradient(90deg, ${fillBg}66, ${fillBg})`,
                                boxShadow:`0 0 12px ${fillBg}88`,
                                transition:"width .5s ease, background .5s",
                                position:"relative", overflow:"hidden" }}>
                                <div style={{ position:"absolute", top:0, left:0, right:0, height:"45%",
                                  background:"rgba(255,255,255,0.28)", borderRadius:"3px 3px 0 0" }}/>
                              </div>
                            </div>

                            {/* Progress Details */}
                            <div style={{ display:"flex", justifyContent:"space-between", marginTop:"4px" }}>
                              <span style={{ fontSize:"9px", fontFamily:"'Inter', sans-serif",
                                color:cc+"88", transition:"color .5s" }}>
                                {hasCatBudget ? `${catUsagePercent.toFixed(0)}% of limit` : `${share}% energy`}
                              </span>
                              <span style={{ fontSize:"9px", fontFamily:"'Inter', sans-serif",
                                color:T.muted, transition:"color .5s" }}>
                                {hasCatBudget ? `${fmt(category.total)} / ${fmt(catBudgetVal)}` : `${fmt(category.total)}`}
                              </span>
                            </div>

                            {/* Category Budget Form & Set Budget Panel */}
                            {isOpen && (
                              <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: `1px dashed ${cc}22` }}>
                                {editingCategory === category.name ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      handleSaveCategoryBudget(category.name);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ display: "flex", gap: "6px", alignItems: "center" }}
                                  >
                                    <input
                                      required
                                      type="number"
                                      min="1"
                                      placeholder="Set cap ₹..."
                                      value={editingBudgetVal}
                                      onChange={(e) => setEditingBudgetVal(e.target.value)}
                                      autoFocus
                                      style={{
                                        flex: 1,
                                        background: T.raised,
                                        color: "#fff",
                                        border: `1px solid ${cc}44`,
                                        borderRadius: "6px",
                                        padding: "4px 8px",
                                        fontSize: "11px",
                                        outline: "none",
                                        fontFamily: "'Inter', sans-serif"
                                      }}
                                    />
                                    <button
                                      type="submit"
                                      style={{
                                        background: cc,
                                        color: "#0a0a14",
                                        border: "none",
                                        borderRadius: "6px",
                                        padding: "4px 10px",
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        fontFamily: "'Inter', sans-serif"
                                      }}
                                    >
                                      SAVE
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCategory(null);
                                        setEditingBudgetVal("");
                                      }}
                                      style={{
                                        background: "transparent",
                                        color: T.muted,
                                        border: `1px solid ${T.muted}`,
                                        borderRadius: "6px",
                                        padding: "4px 8px",
                                        fontSize: "10px",
                                        cursor: "pointer",
                                        fontFamily: "'Inter', sans-serif"
                                      }}
                                    >
                                      CANCEL
                                    </button>
                                  </form>
                                ) : (
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontSize: "9px", color: T.dim, fontFamily: "'Inter', sans-serif" }}>
                                      {hasCatBudget ? `FORM ENERGY CAP: ${fmt(catBudgetVal)}` : "NO BUDGET LIMIT SET"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCategory(category.name);
                                        setEditingBudgetVal(hasCatBudget ? String(catBudgetVal) : "");
                                      }}
                                      style={{
                                        background: "transparent",
                                        border: `1px solid ${cc}33`,
                                        color: cc,
                                        borderRadius: "4px",
                                        padding: "2px 6px",
                                        fontSize: "9px",
                                        cursor: "pointer",
                                        fontFamily: "'Inter', sans-serif",
                                        transition: "all 0.2s"
                                      }}
                                    >
                                      {hasCatBudget ? "✏️ EDIT CAP" : "➕ SET CAP"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Transactions list */}
                            {isOpen && (
                              <div style={{ marginTop:"14px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:"8px",
                                  borderTop:`1px solid ${cc}22`,
                                  paddingTop:"10px", marginBottom:"10px" }}>
                                  {theme==="zenitsu"
                                    ? <Bolt size={10} color={cc+"88"}/>
                                    : <Droplet size={9} color={cc} opacity={0.7}/>}
                                  <span style={{ fontFamily:"'Inter', sans-serif",
                                    fontSize:"8px", letterSpacing:"2px",
                                    color:cc+"77", textTransform:"uppercase",
                                    transition:"color .5s" }}>
                                    STRIKE LOG
                                  </span>
                                  <div style={{ flex:1, height:"1px",
                                    background:`linear-gradient(90deg,${cc}22,transparent)` }}/>
                                  {theme==="tanjiro"
                                    ? <WaterWave color={cc} width={40} opacity={0.4}/>
                                    : <Wisteria size={13} opacity={0.4}/>}
                                </div>
                                {category.items.map((tx,i)=>(
                                  <div key={tx.id} style={{ display:"flex", justifyContent:"space-between",
                                    alignItems:"center",
                                    paddingBottom:"8px", marginBottom:"4px",
                                    borderBottom: i<category.items.length-1 ? `1px solid ${cc}12` : "none" }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                                      <div style={{ width:"5px", height:"5px", borderRadius:"50%",
                                        background:cc, boxShadow:`0 0 5px ${cc}99`, flexShrink:0 }}/>
                                      <div>
                                        <div style={{ fontSize:"12px", color:"#6a6a9a",
                                          fontFamily:"'Inter', sans-serif" }}>{tx.name}</div>
                                        <div style={{ fontSize:"10px", color:T.muted,
                                          fontFamily:"'Inter', sans-serif", marginTop:"1px",
                                          transition:"color .5s" }}>
                                          {tx.dateLabel} <span style={{ color: `${cc}55` }}>•</span> {tx.paymentType || "NA"}
                                        </div>
                                      </div>
                                    </div>
                                    <span style={{ fontSize:"13px", fontWeight:600,
                                      fontFamily:"'Inter', sans-serif",
                                      color:cc, textShadow:`0 0 10px ${cc}55`,
                                      transition:"color .5s" }}>
                                      {fmt(tx.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── ANALYTICS SCROLLS ── */}
              {activeTab === "analytics" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "30px", animation: "slideIn .55s .3s ease both" }}>
                  
                  {/* Daily spend rhythm */}
                  <div style={{
                    background: T.panel,
                    border: `1px solid ${T.primary}22`,
                    borderRadius: "14px",
                    padding: "16px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <MiniKatana color={`${T.primary}77`} size={28}/>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", letterSpacing: "2px", color: `${T.primary}77` }}>
                          DAILY STRIKE RHYTHM
                        </span>
                      </div>
                      <span style={{ fontSize: "8px", color: T.muted, fontFamily: "'Inter', sans-serif" }}>
                        SPEND BY DAY
                      </span>
                    </div>

                    {dailySpend.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "20px", color: T.muted, fontSize: "11px", fontFamily: "'Inter', sans-serif" }}>
                        NO STRIKES RECORDED FOR THIS MONTH
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "flex-end", height: "80px", gap: "4px", padding: "10px 0 2px", overflowX: "auto", overflowY: "hidden" }}>
                        {dailySpend.map((day) => {
                          const percent = (day.total / maxDailySpend) * 100;
                          return (
                            <div key={day.date.toISOString()} style={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              minWidth: "12px",
                              height: "100%"
                            }}>
                              <div
                                title={`${dayFormatter.format(day.date)}: ${fmt(day.total)}`}
                                style={{
                                  width: "100%",
                                  height: `${Math.max(percent, 6)}%`,
                                  background: `linear-gradient(to top, ${T.secondary}77, ${T.primary})`,
                                  boxShadow: `0 0 6px ${T.primary}55`,
                                  borderRadius: "3px 3px 0 0",
                                  transition: "height 0.4s ease, background 0.5s",
                                  position: "relative"
                                }}
                              />
                              <span style={{ fontSize: "8px", color: T.dim, fontFamily: "'Inter', sans-serif", marginTop: "4px" }}>
                                {day.date.getDate()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Monthly Compare */}
                  <div style={{
                    background: T.panel,
                    border: `1px solid ${T.primary}22`,
                    borderRadius: "14px",
                    padding: "16px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <MiniKatana color={`${T.primary}77`} size={28}/>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", letterSpacing: "2px", color: `${T.primary}77` }}>
                          CHRONOLOGY OF STRIKES
                        </span>
                      </div>
                      <span style={{ fontSize: "8px", color: T.muted, fontFamily: "'Inter', sans-serif" }}>
                        MONTH COMPARISON
                      </span>
                    </div>

                    {monthlySpend.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "20px", color: T.muted, fontSize: "11px", fontFamily: "'Inter', sans-serif" }}>
                        NO HISTORY FOUND
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "flex-end", height: "90px", gap: "10px", padding: "10px 0 2px" }}>
                        {monthlySpend.map((month) => {
                          const isActive = month.key === activeMonth;
                          const percent = (month.total / maxMonthlySpend) * 100;
                          return (
                            <button
                              key={month.key}
                              onClick={() => {
                                setSelectedMonth(month.key);
                                resetFilters();
                              }}
                              type="button"
                              style={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                height: "100%",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                outline: "none",
                                padding: 0
                              }}
                            >
                              <span style={{
                                fontSize: "8px",
                                color: isActive ? T.primary : T.dim,
                                fontFamily: "'Inter', sans-serif",
                                fontWeight: isActive ? 700 : 400,
                                marginBottom: "4px",
                                transition: "color 0.3s"
                              }}>
                                {fmt(month.total)}
                              </span>
                              <div style={{
                                width: "100%",
                                height: `${Math.max(percent, 10)}%`,
                                background: isActive ? T.switchBg : `${T.primary}22`,
                                border: `1px solid ${isActive ? T.primary : T.primary + "33"}`,
                                borderRadius: "4px 4px 0 0",
                                boxShadow: isActive ? `0 0 10px ${T.primary}55` : "none",
                                transition: "all 0.3s"
                              }} />
                              <span style={{
                                fontSize: "8px",
                                color: isActive ? T.primary : T.dim,
                                fontFamily: "'Inter', sans-serif",
                                marginTop: "4px",
                                fontWeight: isActive ? 700 : 400
                              }}>
                                {shortMonthFormatter.format(month.date).toUpperCase()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* ── TOOLS GRID ── */}
              {activeTab === "forge" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "30px", animation: "slideIn .55s .35s ease both" }}>
                
                {/* Monthly Budget Editor */}
                <div style={{
                  background: T.panel,
                  border: `1px solid ${T.primary}22`,
                  borderRadius: "14px",
                  padding: "16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
                    <MiniKatana color={`${T.primary}77`} size={28}/>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", letterSpacing: "2px", color: `${T.primary}77` }}>
                      SET MONTHLY ENERGY CAP
                    </span>
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>BUDGET CAPACITY (INR)</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={monthlyBudget}
                      onChange={(e) => updateMonthlyBudget(e.target.value)}
                      style={{
                        background: T.raised,
                        color: "#fff",
                        border: `1px solid ${T.primary}22`,
                        borderRadius: "8px",
                        padding: "8px 12px",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: "12px",
                        outline: "none"
                      }}
                    />
                  </label>
                </div>

                {/* Sandbox Simulator */}
                <div style={{
                  background: T.panel,
                  border: `1px solid ${T.primary}22`,
                  borderRadius: "14px",
                  padding: "16px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <MiniKatana color={`${T.primary}77`} size={28}/>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", letterSpacing: "2px", color: `${T.primary}77` }}>
                        SIMULATE CUSTOM STRIKE (LOCAL)
                      </span>
                    </div>
                    {localTransactions.length > 0 && (
                      <button
                        onClick={clearLocalTransactions}
                        type="button"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#ff4444",
                          fontFamily: "'Inter', sans-serif",
                          fontSize: "9px",
                          cursor: "pointer",
                          textTransform: "uppercase"
                        }}
                      >
                        Reset Local ({localTransactions.length})
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleAddExpense} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>STRIKE NAME</span>
                        <input
                          required
                          disabled={isSubmittingExpense}
                          placeholder="Starbucks Coffee, etc."
                          value={newExpenseName}
                          onChange={(e) => setNewExpenseName(e.target.value)}
                          style={{
                            background: T.raised,
                            color: "#fff",
                            border: `1px solid ${T.primary}22`,
                            borderRadius: "8px",
                            padding: "8px 10px",
                            fontSize: "12px",
                            outline: "none",
                            opacity: isSubmittingExpense ? 0.6 : 1
                          }}
                        />
                      </label>
                      
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>AMOUNT (INR)</span>
                        <input
                          required
                          type="number"
                          min="1"
                          disabled={isSubmittingExpense}
                          placeholder="e.g. 250"
                          value={newExpenseAmount}
                          onChange={(e) => setNewExpenseAmount(e.target.value)}
                          style={{
                            background: T.raised,
                            color: "#fff",
                            border: `1px solid ${T.primary}22`,
                            borderRadius: "8px",
                            padding: "8px 10px",
                            fontSize: "12px",
                            outline: "none",
                            opacity: isSubmittingExpense ? 0.6 : 1
                          }}
                        />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>BREATHING FORM</span>
                        {isCustomCategory ? (
                          <div style={{ display: "flex", gap: "4px" }}>
                            <input
                              required
                              disabled={isSubmittingExpense}
                              placeholder="New category name..."
                              value={customCategory}
                              onChange={(e) => setCustomCategory(e.target.value)}
                              style={{
                                flex: 1,
                                background: T.raised,
                                color: "#fff",
                                border: `1px solid ${T.primary}22`,
                                borderRadius: "8px",
                                padding: "8px 10px",
                                fontSize: "11px",
                                outline: "none",
                                opacity: isSubmittingExpense ? 0.6 : 1
                              }}
                            />
                            <button
                              onClick={() => setIsCustomCategory(false)}
                              disabled={isSubmittingExpense}
                              type="button"
                              style={{
                                background: "transparent",
                                border: `1px solid ${T.primary}44`,
                                color: T.primary,
                                borderRadius: "8px",
                                padding: "0 8px",
                                fontSize: "9px",
                                cursor: isSubmittingExpense ? "not-allowed" : "pointer",
                                fontFamily: "'Inter', sans-serif",
                                opacity: isSubmittingExpense ? 0.6 : 1
                              }}
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <select
                            value={newExpenseCategory}
                            disabled={isSubmittingExpense}
                            onChange={(e) => {
                              if (e.target.value === "__custom__") {
                                setIsCustomCategory(true);
                              } else {
                                setNewExpenseCategory(e.target.value);
                              }
                            }}
                            style={{
                              background: T.raised,
                              color: "#fff",
                              border: `1px solid ${T.primary}22`,
                              borderRadius: "8px",
                              padding: "8px 10px",
                              fontSize: "11px",
                              outline: "none",
                              cursor: isSubmittingExpense ? "not-allowed" : "pointer",
                              opacity: isSubmittingExpense ? 0.6 : 1
                            }}
                          >
                            <option value="" style={{ background: T.raised }}>SELECT FORM</option>
                            {categoryOptions.map((cat) => (
                              <option key={cat} value={cat} style={{ background: T.raised }}>
                                {cat.toUpperCase()}
                              </option>
                            ))}
                            <option value="__custom__" style={{ background: T.raised }}>✨ CREATE NEW FORM...</option>
                          </select>
                        )}
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>PAYMENT TYPE</span>
                        {isCustomPaymentType ? (
                          <div style={{ display: "flex", gap: "4px" }}>
                            <input
                              required
                              disabled={isSubmittingExpense}
                              placeholder="e.g. Gift Card, Amazon Pay"
                              value={customPaymentType}
                              onChange={(e) => setCustomPaymentType(e.target.value)}
                              style={{
                                flex: 1,
                                background: T.raised,
                                color: "#fff",
                                border: `1px solid ${T.primary}22`,
                                borderRadius: "8px",
                                padding: "8px 10px",
                                fontSize: "11px",
                                outline: "none",
                                opacity: isSubmittingExpense ? 0.6 : 1
                              }}
                            />
                            <button
                              onClick={() => setIsCustomPaymentType(false)}
                              disabled={isSubmittingExpense}
                              type="button"
                              style={{
                                background: "transparent",
                                border: `1px solid ${T.primary}44`,
                                color: T.primary,
                                borderRadius: "8px",
                                padding: "0 8px",
                                fontSize: "9px",
                                cursor: isSubmittingExpense ? "not-allowed" : "pointer",
                                fontFamily: "'Inter', sans-serif",
                                opacity: isSubmittingExpense ? 0.6 : 1
                              }}
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <select
                            value={newExpensePaymentType}
                            disabled={isSubmittingExpense}
                            onChange={(e) => {
                              if (e.target.value === "__custom__") {
                                setIsCustomPaymentType(true);
                              } else {
                                setNewExpensePaymentType(e.target.value);
                              }
                            }}
                            style={{
                              background: T.raised,
                              color: "#fff",
                              border: `1px solid ${T.primary}22`,
                              borderRadius: "8px",
                              padding: "8px 10px",
                              fontSize: "11px",
                              outline: "none",
                              cursor: isSubmittingExpense ? "not-allowed" : "pointer",
                              opacity: isSubmittingExpense ? 0.6 : 1
                            }}
                          >
                            <option value="UPI" style={{ background: T.raised }}>UPI (🏦)</option>
                            <option value="Credit Card" style={{ background: T.raised }}>CREDIT CARD (💳)</option>
                            <option value="Debit Card" style={{ background: T.raised }}>DEBIT CARD (📇)</option>
                            <option value="Cash" style={{ background: T.raised }}>CASH (💵)</option>
                            <option value="Net Banking" style={{ background: T.raised }}>NET BANKING (🌐)</option>
                            <option value="NA" style={{ background: T.raised }}>NA (➖)</option>
                            <option value="__custom__" style={{ background: T.raised }}>✨ ADD OTHER METHOD...</option>
                          </select>
                        )}
                      </label>

                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>DATE OF STRIKE</span>
                        <input
                          type="date"
                          required
                          disabled={isSubmittingExpense}
                          value={newExpenseDate}
                          onChange={(e) => setNewExpenseDate(e.target.value)}
                          style={{
                            background: T.raised,
                            color: "#fff",
                            border: `1px solid ${T.primary}22`,
                            borderRadius: "8px",
                            padding: "7px 10px",
                            fontSize: "12px",
                            outline: "none",
                            opacity: isSubmittingExpense ? 0.6 : 1
                          }}
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingExpense}
                      style={{
                        background: T.switchBg,
                        color: T.switchText,
                        border: "none",
                        borderRadius: "10px",
                        padding: "10px",
                        fontWeight: 700,
                        fontSize: "11px",
                        fontFamily: "'Inter', sans-serif",
                        letterSpacing: "1px",
                        cursor: isSubmittingExpense ? "not-allowed" : "pointer",
                        transition: "all 0.3s",
                        boxShadow: `0 0 10px ${T.primary}44`,
                        opacity: isSubmittingExpense ? 0.7 : 1
                      }}
                      onMouseEnter={(e) => { if (!isSubmittingExpense) e.currentTarget.style.filter = "brightness(1.1)"; }}
                      onMouseLeave={(e) => e.currentTarget.style.filter = "none"}
                    >
                      {isSubmittingExpense ? (
                        "🌀 EXECUTING STRIKE (SYNCING)..."
                      ) : isCustomActive && customAppsScriptUrl.trim() ? (
                        "⚡ EXECUTE STRIKE (SYNC TO SHEET)"
                      ) : (
                        "⚡ EXECUTE SIMULATED STRIKE"
                      )}
                    </button>
                  </form>
                </div>

              </div>
              )}
            </>
          )}

          {/* ── FOOTER ── */}
          <div style={{ textAlign:"center", paddingBottom:"20px",
            animation:"slideIn .55s .6s ease both" }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:"12px",
              opacity:0.45, animation:"pulsePrimary 4s ease-in-out infinite" }}>
              {theme==="zenitsu"
                ? <Katana width={190} color={T.primary} secondary={T.secondary} glowing={false}/>
                : <TanjiroKatana width={190} glowing={false}/>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"12px",
              marginBottom:"12px", opacity:.28 }}>
              <div style={{ flex:1, height:"1px",
                background:`linear-gradient(90deg,transparent,${T.primary}55,transparent)` }}/>
              <CorpsMark size={18} color={T.primary}/>
              <div style={{ flex:1, height:"1px",
                background:`linear-gradient(90deg,transparent,${T.primary}55,transparent)` }}/>
            </div>
            <div style={{ height:"4px", borderRadius:"2px",
              background:`repeating-linear-gradient(${T.haoriAngle},${T.haoriColor1} 0,${T.haoriColor1} 8px,${T.haoriColor2} 8px,${T.haoriColor2} 16px)`,
              opacity:0.4, transition:"background .5s", marginBottom:"10px" }}/>
            <p style={{ margin:"4px 0 0", fontFamily:"'Inter', sans-serif",
              fontSize:"10px", color:T.dim, letterSpacing:"2px", textTransform:"uppercase",
              transition:"color .5s" }}>
              DEMON SLAYER CORPS · LEDGER SYSTEM
            </p>
          </div>

          {/* Custom Toast Notifications */}
          {toast.show && (
            <div
              className="toast-notification"
              style={{
                position: "fixed",
                top: "24px",
                left: "50%",
                transform: "translateX(-50%)",
                background: T.panel,
                border: `1px solid ${toast.type === "success" ? T.accent || "#AAFF44" : toast.type === "warning" ? "#FFA040" : T.primary}aa`,
                boxShadow: `0 8px 24px rgba(0, 0, 0, 0.4), 0 0 12px ${toast.type === "success" ? T.accent || "#AAFF44" : toast.type === "warning" ? "#FFA040" : T.primary}33`,
                borderRadius: "12px",
                padding: "12px 20px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                zIndex: 9999,
                fontFamily: "'Inter', sans-serif",
                fontSize: "12px",
                color: "#fff"
              }}
            >
              <span style={{ fontSize: "16px" }}>
                {toast.type === "success" ? "⚔️" : toast.type === "warning" ? "⚠️" : "ℹ️"}
              </span>
              <span style={{ fontWeight: 500 }}>{toast.message}</span>
            </div>
          )}

          {/* Full-screen Sword Clash Slash Animation overlay */}
          {isSlashPlaying && (
            <div
              className={`slash-overlay slash-active-${slashTriggerTheme}`}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                overflow: "hidden"
              }}
            >
              <div className="slash-line" style={{ left: "-20%" }} />
            </div>
          )}

          {/* Glassmorphic Bottom Navigation Bar */}
          <nav className="bottom-nav-bar">
            {[
              { id: "dashboard", label: "Dashboard", emoji: "🏠" },
              { id: "forms", label: "Forms", emoji: "⚔️" },
              { id: "analytics", label: "Training", emoji: "📊" },
              { id: "forge", label: "Forge", emoji: "🔨" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
                className={`nav-tab-btn ${activeTab === tab.id ? "nav-tab-btn-active" : ""}`}
              >
                <span style={{ fontSize: "20px" }}>{tab.emoji}</span>
                <span style={{ fontSize: "9px", fontFamily: "'Inter', sans-serif", letterSpacing: "1px", fontWeight: activeTab === tab.id ? 700 : 500 }}>
                  {tab.label}
                </span>
              </button>
            ))}
          </nav>

        </div>

      </div>

      {/* Google Sheets Connector Drawer Overlay */}
      {isConnectorOpen && (
        <div
          onClick={() => setIsConnectorOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 999,
            transition: "all 0.3s"
          }}
        />
      )}
      
      {/* Slide-in Connector Drawer */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: isConnectorOpen ? 0 : "-400px",
          width: "100%",
          maxWidth: "380px",
          height: "100vh",
          background: T.panel,
          borderLeft: `1px solid ${T.primary}33`,
          boxShadow: `-10px 0 30px rgba(0,0,0,0.6)`,
          zIndex: 1000,
          padding: "24px 20px",
          overflowY: "auto",
          transition: "right 0.3s ease-in-out, background 0.5s, border-left-color 0.5s",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: T.primary, fontSize: "20px", margin: 0, fontWeight: 700 }}>
            SYNC PORTAL
          </h2>
          <button
            onClick={() => setIsConnectorOpen(false)}
            type="button"
            style={{
              background: "transparent",
              border: "none",
              color: T.primary,
              fontSize: "24px",
              cursor: "pointer",
              lineHeight: 1
            }}
          >
            &times;
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ color: "#d0cce8", fontSize: "12px", lineHeight: 1.5, margin: 0 }}>
            Establish a bridge to your personal Google Sheet to sync real-time financial strikes.
          </p>

          <form onSubmit={handleConnectSheet} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>GOOGLE SHEET URL OR ID</span>
              <input
                required
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                value={sheetUrlInput}
                onChange={(e) => setSheetUrlInput(e.target.value)}
                style={{
                  background: T.raised,
                  color: "#fff",
                  border: `1px solid ${T.primary}22`,
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "12px",
                  outline: "none"
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>SHEET TAB NAME (CASE-SENSITIVE)</span>
              <input
                required
                type="text"
                placeholder="e.g. Expense"
                value={sheetTabInput}
                onChange={(e) => setSheetTabInput(e.target.value)}
                style={{
                  background: T.raised,
                  color: "#fff",
                  border: `1px solid ${T.primary}22`,
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "12px",
                  outline: "none"
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "9px", color: T.dim }}>APPS SCRIPT WEB APP URL (FOR ADDING DATA)</span>
              <input
                type="url"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={appsScriptUrlInput}
                onChange={(e) => setAppsScriptUrlInput(e.target.value)}
                style={{
                  background: T.raised,
                  color: "#fff",
                  border: `1px solid ${T.primary}22`,
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "12px",
                  outline: "none"
                }}
              />
            </label>

            {connectorStatus === "checking" && (
              <div style={{ padding: "10px", background: `${T.secondary}11`, border: `1px solid ${T.secondary}44`, borderRadius: "8px", color: T.secondary, fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ animation: "pulsePrimary 1.5s infinite", display: "inline-block" }}>🌀</span> Validating connection to Google Sheet...
              </div>
            )}

            {connectorStatus === "success" && (
              <div style={{ padding: "10px", background: `${T.accent}11`, border: `1px solid ${T.accent}44`, borderRadius: "8px", color: T.accent, fontSize: "11px" }}>
                ✅ Connection established! Synced successfully.
              </div>
            )}

            {connectorStatus === "error" && (
              <div style={{ padding: "10px", background: "rgba(255, 68, 68, 0.1)", border: "1px solid rgba(255, 68, 68, 0.4)", borderRadius: "8px", color: "#ff4444", fontSize: "11px" }}>
                ❌ <strong>Error:</strong> {connectorError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
              <button
                type="submit"
                disabled={connectorStatus === "checking"}
                style={{
                  background: T.switchBg,
                  color: T.switchText,
                  border: "none",
                  borderRadius: "10px",
                  padding: "12px",
                  fontWeight: 700,
                  fontSize: "11px",
                  fontFamily: "'Inter', sans-serif",
                  cursor: "pointer",
                  transition: "all 0.3s",
                  boxShadow: `0 0 10px ${T.primary}44`
                }}
              >
                CONNECT & SYNC
              </button>

              {isCustomActive && (
                <button
                  type="button"
                  onClick={handleResetToDemo}
                  style={{
                    background: "transparent",
                    color: "#ff4444",
                    border: "1px solid rgba(255, 68, 68, 0.4)",
                    borderRadius: "10px",
                    padding: "10px",
                    fontWeight: 600,
                    fontSize: "10px",
                    fontFamily: "'Inter', sans-serif",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  DISCONNECT (USE DEMO SHEET)
                </button>
              )}
            </div>
          </form>

          <hr style={{ border: "none", borderTop: `1px solid ${T.primary}22`, margin: "16px 0" }} />

          <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: T.primary, fontSize: "13px", margin: "0 0 4px" }}>
              📖 sharing & sync settings
            </h3>
            <ol style={{ margin: 0, paddingLeft: "16px", color: "#d0cce8", fontSize: "11px", display: "flex", flexDirection: "column", gap: "8px", lineHeight: 1.4 }}>
              <li>Open your Google Sheet and click the blue <strong>Share</strong> button in the top right.</li>
              <li>Under General access, change restriction to <strong>"Anyone with the link can view"</strong>.</li>
              <li>Make sure the sheet has columns titled exactly: <strong>Date</strong>, <strong>Expense</strong>, <strong>Amount</strong>, and <strong>Category</strong>.</li>
              <li>To write data from the app, open your Sheet ➔ click <strong>Extensions</strong> ➔ <strong>Apps Script</strong>.</li>
              <li>Paste your `doPost` Apps Script code, and click <strong>Deploy</strong> ➔ <strong>New deployment</strong>.</li>
              <li>Choose <strong>Web app</strong>. Execute as: <strong>Me</strong>, and Who has access: <strong>Anyone</strong>.</li>
              <li>Copy the Web App URL and paste it in the Web App field above!</li>
            </ol>
          </section>
        </div>
      </aside>
    </>
  );
}
