import { useEffect, useMemo, useState } from "react";
import "./App.css";

const DEFAULT_SHEET_URL =
  "https://opensheet.elk.sh/10A8amXj7QMzCfByz3Craq5dTnqwabD-0eN2v7ppoIsc/Expense";

const SHEET_URL = import.meta.env.VITE_SHEET_URL || DEFAULT_SHEET_URL;

const palette = ["#f8d66d", "#5eead4", "#a78bfa", "#fb7185", "#7dd3fc", "#86efac"];

const DEFAULT_MONTHLY_BUDGET = 50000;
const BUDGET_STORAGE_KEY = "finance-dashboard-monthly-budget";
const LOCAL_TX_STORAGE_KEY = "finance-dashboard-local-transactions";
const CUSTOM_SHEET_ID_KEY = "finance-dashboard-custom-sheet-id";
const CUSTOM_SHEET_NAME_KEY = "finance-dashboard-custom-sheet-name";
const CUSTOM_SHEET_ACTIVE_KEY = "finance-dashboard-custom-sheet-active";
const CATEGORY_BUDGETS_KEY = "finance-dashboard-category-budgets";
const THEME_KEY = "finance-dashboard-theme";

const currency = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "INR",
});

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
  const direct = new Date(raw);

  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (!match) return null;

  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  const parsed = new Date(Number(fullYear), Number(month) - 1, Number(day));

  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    return localStorage.getItem(CUSTOM_SHEET_ID_KEY) || "";
  } catch {
    return "";
  }
}

function getStoredCustomSheetName() {
  try {
    return localStorage.getItem(CUSTOM_SHEET_NAME_KEY) || "Expense";
  } catch {
    return "Expense";
  }
}

function getStoredCustomSheetActive() {
  try {
    return localStorage.getItem(CUSTOM_SHEET_ACTIVE_KEY) === "true";
  } catch {
    return false;
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

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || "dark";
  } catch {
    return "dark";
  }
}

function buildDonutGradient(categories, total) {
  if (total <= 0 || categories.length === 0) {
    return "rgba(255, 255, 255, 0.08)";
  }

  let cursor = 0;
  const segments = categories.map((category, index) => {
    const start = cursor;
    const size = (category.total / total) * 100;
    cursor += size;
    const color = palette[index % palette.length];
    return `${color} ${start}% ${cursor}%`;
  });

  return `conic-gradient(${segments.join(", ")})`;
}

export default function App() {
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
  const [isCustomActive, setIsCustomActive] = useState(getStoredCustomSheetActive);
  const [isConnectorOpen, setIsConnectorOpen] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState(() => {
    const storedId = getStoredCustomSheetId();
    return storedId ? `https://docs.google.com/spreadsheets/d/${storedId}/edit` : "";
  });
  const [sheetTabInput, setSheetTabInput] = useState(getStoredCustomSheetName);
  const [connectorStatus, setConnectorStatus] = useState("idle"); // idle, checking, success, error
  const [connectorError, setConnectorError] = useState("");

  // Upgrade Feature States
  const [theme, setTheme] = useState(getStoredTheme);
  const [categoryBudgets, setCategoryBudgets] = useState(getStoredCategoryBudgets);
  const [editingCategory, setEditingCategory] = useState(null); // name of category currently editing budget
  const [editingBudgetVal, setEditingBudgetVal] = useState("");

  // Sandbox Simulator Form States
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  const [newExpenseDate, setNewExpenseDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  // Sync state effects
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
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
  }, [customSheetId, customSheetName, isCustomActive]);

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
        `${tx.name} ${tx.category} ${tx.dateLabel}`.toLowerCase().includes(normalizedQuery);

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
  const averageSpend =
    visibleTransactions.length > 0 ? totalSpent / visibleTransactions.length : 0;
  const topCategory = groupedCategories[0];
  const highestDay = dailySpend.reduce(
    (best, day) => (day.total > best.total ? day : best),
    { total: 0, date: null },
  );
  const maxDailySpend = Math.max(...dailySpend.map((day) => day.total), 1);
  const maxMonthlySpend = Math.max(...monthlySpend.map((month) => month.total), 1);
  const activeMonthIndex = monthlySpend.findIndex((month) => month.key === activeMonth);
  const previousMonth = activeMonthIndex > 0 ? monthlySpend[activeMonthIndex - 1] : null;
  const monthChange = previousMonth ? monthlyTotal - previousMonth.total : 0;
  const monthChangePercent =
    previousMonth && previousMonth.total > 0
      ? (monthChange / previousMonth.total) * 100
      : 0;
  const currentMonthLabel =
    monthOptions.find((month) => month.value === activeMonth)?.label || "Select a month";
  const donutGradient = buildDonutGradient(groupedCategories, totalSpent);
  const budgetUsed = monthlyBudget > 0 ? (monthlyTotal / monthlyBudget) * 100 : 0;
  const budgetRemaining = monthlyBudget - monthlyTotal;

  // --- UPGRADE: PREDICTIVE METRICS & SPENDING VELOCITY ---
  const { projectedEOMSpent, dailyAllowanceRemaining, daysRemaining, daysElapsed, totalDaysInMonth } = useMemo(() => {
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

    const spentVelocity = elapsed > 0 ? monthlyTotal / elapsed : 0;
    const projected = spentVelocity * totalDays;
    const remaining = totalDays - elapsed;

    const budgetLeft = Math.max(0, monthlyBudget - monthlyTotal);
    const dailyAllowance = remaining > 0 ? budgetLeft / remaining : 0;

    return {
      projectedEOMSpent: projected,
      dailyAllowanceRemaining: dailyAllowance,
      daysRemaining: remaining,
      daysElapsed: elapsed,
      totalDaysInMonth: totalDays,
    };
  }, [activeMonth, monthlyTotal, monthlyBudget]);

  // --- UPGRADE: SMART FINANCIAL INSIGHTS (AI INSIGHTS) ---
  const insights = useMemo(() => {
    const list = [];
    if (!monthlyTransactions.length) return list;

    // 1. Subscription detector (Identifies potential subscription services)
    const suspectKeywords = [
      "netflix", "spotify", "google", "youtube", "premium", "rent", "broadband",
      "recharge", "sub", "membership", "cloud", "aws", "adobe", "apple", "microsoft", "github"
    ];
    const processedSubs = new Set();

    monthlyTransactions.forEach((tx) => {
      const lowerName = tx.name.toLowerCase();
      const isSuspect = suspectKeywords.some(kw => lowerName.includes(kw));
      if (isSuspect && !processedSubs.has(lowerName)) {
        processedSubs.add(lowerName);
        list.push({
          type: "subscription",
          title: "Potential Subscription Found",
          description: `"${tx.name}" (${currency.format(tx.amount)}) matches recurring billing signatures.`,
          icon: "📅"
        });
      }
    });

    // 2. Single spend spike (Any transaction consuming > 20% of monthly budget)
    monthlyTransactions.forEach((tx) => {
      if (monthlyBudget > 0 && tx.amount >= monthlyBudget * 0.2) {
        list.push({
          type: "spike",
          title: "Single Spend Spike Alert",
          description: `"${tx.name}" cost ${currency.format(tx.amount)}, consuming ${(tx.amount / monthlyBudget * 100).toFixed(0)}% of EOM capacity.`,
          icon: "⚠️"
        });
      }
    });

    // 3. Positive Savings Trend
    if (monthlyTotal < monthlyBudget * 0.5 && daysElapsed >= totalDaysInMonth * 0.5) {
      list.push({
        type: "vibe",
        title: "Healthy Savings Track",
        description: `Elapsed ${daysElapsed} days of the month but consumed only ${(monthlyTotal / monthlyBudget * 100).toFixed(0)}% of budget.`,
        icon: "🎉"
      });
    }

    // 4. Overspend Warning
    if (monthlyTotal > monthlyBudget) {
      list.push({
        type: "spike",
        title: "Budget Cap Overrun",
        description: `Your active month spent total is ${currency.format(monthlyTotal - monthlyBudget)} over budget capacity!`,
        icon: "🚨"
      });
    }

    // 5. Monthly comparison trend
    if (previousMonth && monthChangePercent !== 0) {
      const isHigher = monthChange >= 0;
      list.push({
        type: isHigher ? "spike" : "vibe",
        title: isHigher ? "Spending Up from Last Month" : "Savings Up from Last Month",
        description: `You've spent ${currency.format(Math.abs(monthChange))} (${Math.abs(monthChangePercent).toFixed(0)}%) ${isHigher ? "more" : "less"} than last month.`,
        icon: isHigher ? "📈" : "📉"
      });
    }

    return list.slice(0, 3);
  }, [monthlyTransactions, monthlyBudget, monthlyTotal, daysElapsed, totalDaysInMonth, previousMonth, monthChange, monthChangePercent]);

  const resetFilters = () => {
    setQuery("");
    setSelectedCategory("all");
    setExpanded({});
  };

  const updateMonthlyBudget = (value) => {
    const nextBudget = Math.max(0, Number(value) || 0);
    setMonthlyBudget(nextBudget);
  };

  const toggle = (name) => {
    setExpanded((prev) => ({
      ...prev,
      [name]: !prev[name],
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

      // Quick validation of the first item keys
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

      // Success! Update state and localStorage
      setCustomSheetId(extractedId);
      setCustomSheetName(tabName);
      setIsCustomActive(true);

      localStorage.setItem(CUSTOM_SHEET_ID_KEY, extractedId);
      localStorage.setItem(CUSTOM_SHEET_NAME_KEY, tabName);
      localStorage.setItem(CUSTOM_SHEET_ACTIVE_KEY, "true");

      setConnectorStatus("success");
      
      // Auto-close drawer after a short delay
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

  const handleAddExpense = (e) => {
    e.preventDefault();
    if (!newExpenseName.trim() || !newExpenseAmount) return;

    const finalCategory = isCustomCategory ? customCategory.trim() : newExpenseCategory;
    if (!finalCategory) {
      alert("Please select or enter a category.");
      return;
    }

    const parts = newExpenseDate.split("-");
    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

    const newTx = {
      id: `local-${Date.now()}`,
      Expense: newExpenseName.trim(),
      Amount: String(newExpenseAmount),
      Category: finalCategory,
      Date: formattedDate,
    };

    setLocalTransactions((prev) => [newTx, ...prev]);

    // Reset form fields
    setNewExpenseName("");
    setNewExpenseAmount("");
    setCustomCategory("");
    setIsCustomCategory(false);
  };

  const clearLocalTransactions = () => {
    if (window.confirm("Are you sure you want to clear all locally added transactions?")) {
      setLocalTransactions([]);
    }
  };

  const exportToCSV = () => {
    const headers = ["Date", "Expense", "Amount", "Category"];
    const rows = visibleTransactions.map((tx) => [
      tx.dateLabel,
      `"${tx.name.replace(/"/g, '""')}"`,
      tx.amount,
      `"${tx.category.replace(/"/g, '""')}"`,
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

  const getBudgetMeterStyle = (used) => {
    if (used >= 100) {
      return {
        width: "100%",
        background: "linear-gradient(90deg, #fb7185, #fb7185)",
        boxShadow: "0 0 12px rgba(251, 113, 133, 0.6)",
      };
    }
    if (used >= 75) {
      return {
        width: `${used}%`,
        background: "linear-gradient(90deg, #f8d66d, #fb7185)",
        boxShadow: "0 0 8px rgba(248, 214, 109, 0.3)",
      };
    }
    return {
      width: `${used}%`,
      background: "linear-gradient(90deg, #5eead4, #f8d66d)",
    };
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="dashboard">
        <header className="hero-panel">
          <div>
            <p className="eyebrow">Personal finance</p>
            <h1>{currentMonthLabel}</h1>
            <p className="hero-copy">
              Live spending intelligence {isCustomActive ? "from your connected sheet" : "from your expense sheet"}.
            </p>
          </div>

          <div className="hero-actions">
            <button
              className="btn-theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              type="button"
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <button
              className={`btn-connect-sheet ${isCustomActive ? "is-active" : ""}`}
              onClick={() => setIsConnectorOpen(true)}
              type="button"
            >
              {isCustomActive ? "⚙️ Manage Sheet" : "✨ Connect Sheet"}
            </button>

            <label className="month-control">
              <span>Month</span>
              <select
                value={activeMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  resetFilters();
                }}
                disabled={monthOptions.length === 0}
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {status === "loading" && (
          <div className="state-panel">Loading your expenses...</div>
        )}

        {status === "error" && (
          <div className="state-panel state-error">
            <strong>Could not load dashboard.</strong>
            <span>{error}</span>
          </div>
        )}

        {status === "ready" && (
          <>
            <section className="summary-grid" aria-label="Monthly summary">
              <article className="metric-card metric-primary">
                <span>Visible spend</span>
                <strong>{currency.format(totalSpent)}</strong>
                <small>
                  {visibleTransactions.length} of {monthlyTransactions.length} transactions
                </small>
              </article>

              <article className="metric-card">
                <span>Average</span>
                <strong>{currency.format(averageSpend)}</strong>
                <small>Per visible transaction</small>
              </article>

              <article className="metric-card">
                <span>Top category</span>
                <strong>{topCategory?.name || "None"}</strong>
                <small>
                  {topCategory ? currency.format(topCategory.total) : "No spend"}
                </small>
              </article>
            </section>

            <section className="insight-grid" aria-label="Spending insights">
              <article className={`insight-panel ${budgetRemaining < 0 ? "budget-exceeded" : ""}`}>
                <div>
                  <span className="section-label">Budget pulse</span>
                  <strong className={budgetRemaining < 0 ? "text-crimson" : ""}>
                    {budgetRemaining < 0
                      ? `-${currency.format(Math.abs(budgetRemaining))}`
                      : currency.format(budgetRemaining)}
                  </strong>
                  <small className={budgetRemaining < 0 ? "text-crimson-small" : ""}>
                    {budgetRemaining < 0
                      ? `${budgetUsed.toFixed(0)}% used (Overspent!)`
                      : `${budgetUsed.toFixed(0)}% of monthly budget used`}
                  </small>
                </div>
                <div className="budget-meter" aria-hidden="true">
                  <span style={getBudgetMeterStyle(budgetUsed)} />
                </div>
              </article>

              <article className="insight-panel">
                <span className="section-label">EOM Projection</span>
                <strong className={`eom-projected-value ${projectedEOMSpent > monthlyBudget ? "pulsing-crimson" : ""}`}>
                  {currency.format(projectedEOMSpent)}
                </strong>
                <small>
                  {projectedEOMSpent > monthlyBudget
                    ? "⚠️ Est. overspend risk"
                    : "✅ Est. within budget cap"}
                </small>
              </article>

              <article className="insight-panel">
                <span className="section-label">Highest day</span>
                <strong>
                  {highestDay.date ? dayFormatter.format(highestDay.date) : "None"}
                </strong>
                <small>{currency.format(highestDay.total)}</small>
              </article>

              <article className="insight-panel">
                <span className="section-label">Daily Allowance</span>
                <strong>{currency.format(dailyAllowanceRemaining)}</strong>
                <small>For remaining {daysRemaining} days</small>
              </article>
            </section>

            <section className="analytics-grid" aria-label="Visual analytics">
              <article className="chart-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-label">Category mix</span>
                    <h2>Where the money went</h2>
                  </div>
                </div>

                <div className="donut-wrap">
                  <div
                    className="donut-chart"
                    style={{ background: donutGradient, cursor: "pointer" }}
                    onClick={() => setSelectedCategory("all")}
                    title="Click to reset category filter"
                  >
                    <span>{groupedCategories.length}</span>
                    <small>categories</small>
                  </div>

                  <div className="legend-list">
                    {groupedCategories.slice(0, 6).map((category, index) => (
                      <button
                        className={`legend-row-btn ${selectedCategory === category.name ? "is-active" : ""}`}
                        key={category.name}
                        onClick={() => {
                          setSelectedCategory(
                            selectedCategory === category.name ? "all" : category.name
                          );
                        }}
                        type="button"
                      >
                        <span
                          className="category-dot"
                          style={{ backgroundColor: palette[index % palette.length] }}
                        />
                        <strong>{category.name}</strong>
                        <small>{currency.format(category.total)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </article>

              <article className="chart-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-label">Daily rhythm</span>
                    <h2>Spend by day</h2>
                  </div>
                </div>

                <div className="bar-chart">
                  {dailySpend.map((day) => (
                    <div className="bar-item" key={day.date.toISOString()}>
                      <span
                        className="bar-fill"
                        style={{ height: `${Math.max((day.total / maxDailySpend) * 100, 5)}%` }}
                        title={`${dayFormatter.format(day.date)}: ${currency.format(day.total)}`}
                      />
                      <small>{day.date.getDate()}</small>
                    </div>
                  ))}
                </div>
              </article>

              <article className="chart-panel monthly-chart-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-label">Monthly compare</span>
                    <h2>Spend across months</h2>
                  </div>
                </div>

                <div className="monthly-chart">
                  {monthlySpend.map((month) => {
                    const isActive = month.key === activeMonth;

                    return (
                      <button
                        className={`month-bar-item ${isActive ? "is-active" : ""}`}
                        key={month.key}
                        onClick={() => {
                          setSelectedMonth(month.key);
                          resetFilters();
                        }}
                        title={`${monthFormatter.format(month.date)}: ${currency.format(
                          month.total,
                        )}`}
                        type="button"
                      >
                        <span className="month-total">
                          {currency.format(month.total)}
                        </span>
                        <span
                          className="month-bar-fill"
                          style={{
                            height: `${Math.max((month.total / maxMonthlySpend) * 100, 8)}%`,
                          }}
                        />
                        <small>{shortMonthFormatter.format(month.date)}</small>
                      </button>
                    );
                  })}
                </div>
              </article>
            </section>

            {insights.length > 0 && (
              <section className="metric-card financial-insights-panel" aria-label="Smart Financial Advisor Insights">
                <div className="section-heading">
                  <div>
                    <span className="section-label">🧠 AI-Style Advisor</span>
                    <h2>Financial Pulse Insights</h2>
                  </div>
                </div>

                <div className="insights-list">
                  {insights.map((insight, idx) => (
                    <article className="insight-item-card" key={idx}>
                      <div className={`insight-icon-box ${
                        insight.type === "subscription" ? "icon-sub" :
                        insight.type === "spike" ? "icon-spike" : "icon-vibe"
                      }`}>
                        {insight.icon}
                      </div>
                      <div>
                        <h4>{insight.title}</h4>
                        <p>{insight.description}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="filter-panel" aria-label="Expense filters">
              <label>
                <span>Search</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Expense, category, date"
                  type="search"
                />
              </label>

              <label>
                <span>Category</span>
                <select
                  value={selectedCategory}
                  onChange={(event) => {
                    setSelectedCategory(event.target.value);
                    setExpanded({});
                  }}
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <div className="filter-actions-row">
                <button onClick={resetFilters} type="button">
                  Reset
                </button>
                <button
                  className="btn-secondary"
                  onClick={exportToCSV}
                  type="button"
                  disabled={visibleTransactions.length === 0}
                >
                  Export CSV
                </button>
              </div>
            </section>

            <div className="tools-grid">
              <section className="budget-editor" aria-label="Monthly budget">
                <div className="section-heading">
                  <div>
                    <span className="section-label">Budget</span>
                    <h2>Monthly budget</h2>
                  </div>
                </div>

                <label className="budget-input monthly-budget-input">
                  <span>Monthly budget</span>
                  <input
                    min="0"
                    onChange={(event) => updateMonthlyBudget(event.target.value)}
                    step="500"
                    type="number"
                    value={monthlyBudget}
                  />
                </label>
              </section>

              <section className="budget-editor sandbox-simulator" aria-label="Sandbox Simulator">
                <div className="section-heading">
                  <div>
                    <span className="section-label">Sandbox Simulator</span>
                    <h2>Add custom transaction</h2>
                  </div>
                  {localTransactions.length > 0 && (
                    <button
                      className="btn-danger-link"
                      onClick={clearLocalTransactions}
                      type="button"
                    >
                      Reset Local ({localTransactions.length})
                    </button>
                  )}
                </div>

                <form className="sandbox-form" onSubmit={handleAddExpense}>
                  <div className="form-group-row">
                    <label className="budget-input">
                      <span>Expense name</span>
                      <input
                        required
                        placeholder="e.g., Starbucks Coffee"
                        type="text"
                        value={newExpenseName}
                        onChange={(e) => setNewExpenseName(e.target.value)}
                      />
                    </label>

                    <label className="budget-input">
                      <span>Amount (INR)</span>
                      <input
                        required
                        min="1"
                        placeholder="e.g., 250"
                        type="number"
                        value={newExpenseAmount}
                        onChange={(e) => setNewExpenseAmount(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="form-group-row">
                    <label className="budget-input">
                      <span>Category</span>
                      {isCustomCategory ? (
                        <div className="custom-cat-row">
                          <input
                            required
                            placeholder="Type new category..."
                            type="text"
                            value={customCategory}
                            onChange={(e) => setCustomCategory(e.target.value)}
                          />
                          <button
                            className="btn-text-action"
                            onClick={() => setIsCustomCategory(false)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <select
                          value={newExpenseCategory}
                          onChange={(e) => {
                            if (e.target.value === "__custom__") {
                              setIsCustomCategory(true);
                            } else {
                              setNewExpenseCategory(e.target.value);
                            }
                          }}
                        >
                          <option value="">Select a category</option>
                          {categoryOptions.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                          <option value="__custom__">✨ Create custom category...</option>
                        </select>
                      )}
                    </label>

                    <label className="budget-input">
                      <span>Date</span>
                      <input
                        required
                        type="date"
                        value={newExpenseDate}
                        onChange={(e) => setNewExpenseDate(e.target.value)}
                      />
                    </label>
                  </div>

                  <button className="sandbox-submit-btn" type="submit">
                    <span>✨ Add Simulated Expense</span>
                  </button>
                </form>
              </section>
            </div>

            {visibleTransactions.length === 0 ? (
              <div className="state-panel">No expenses match the current filters.</div>
            ) : (
              <section className="category-list" aria-label="Category breakdown">
                {groupedCategories.map((category, index) => {
                  const color = palette[index % palette.length];
                  const isOpen = Boolean(expanded[category.name]);
                  const progress =
                    totalSpent > 0 ? (category.total / totalSpent) * 100 : 0;
                  const budgetShare =
                    monthlyBudget > 0 ? (category.total / monthlyBudget) * 100 : 0;

                  return (
                    <article className="category-card" key={category.name}>
                      <button
                        aria-expanded={isOpen}
                        className="category-trigger"
                        onClick={() => toggle(category.name)}
                        type="button"
                      >
                        <span
                          className="category-dot"
                          style={{ backgroundColor: color }}
                        />
                        <span className="category-title-block">
                          <strong>{category.name}</strong>
                          <small>{category.items.length} transactions</small>
                        </span>
                        <span className="category-amount">
                          {currency.format(category.total)}
                        </span>
                        <span className="category-chevron">
                          {isOpen ? "Close" : "Open"}
                        </span>
                      </button>

                      {(() => {
                        const hasCatBudget = categoryBudgets[category.name] !== undefined && categoryBudgets[category.name] > 0;
                        const catBudgetVal = hasCatBudget ? categoryBudgets[category.name] : 0;
                        const catUsagePercent = hasCatBudget ? (category.total / catBudgetVal) * 100 : 0;

                        // Dynamic class for progress colors
                        let progressClass = "";
                        if (hasCatBudget) {
                          if (catUsagePercent >= 90) progressClass = "over-limit";
                          else if (catUsagePercent >= 70) progressClass = "near-limit";
                          else progressClass = "under-limit";
                        }

                        return (
                          <>
                            <div className="progress-track">
                              <span
                                className={`progress-fill ${progressClass}`}
                                style={{
                                  backgroundColor: progressClass ? undefined : color,
                                  width: `${hasCatBudget ? Math.min(catUsagePercent, 100) : progress}%`,
                                }}
                              />
                            </div>

                            <div className="budget-row">
                              {editingCategory === category.name ? (
                                <form 
                                  className="category-budget-form"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    handleSaveCategoryBudget(category.name);
                                  }}
                                >
                                  <input
                                    required
                                    type="number"
                                    min="1"
                                    placeholder="Enter budget ₹..."
                                    value={editingBudgetVal}
                                    onChange={(e) => setEditingBudgetVal(e.target.value)}
                                    autoFocus
                                  />
                                  <button type="submit" className="btn-save-budget">Save</button>
                                  <button 
                                    type="button" 
                                    className="btn-cancel-budget"
                                    onClick={() => {
                                      setEditingCategory(null);
                                      setEditingBudgetVal("");
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <div className="category-budget-block">
                                  <span>
                                    {hasCatBudget ? (
                                      <>
                                        <strong>{catUsagePercent.toFixed(0)}%</strong> of Category Budget ({currency.format(category.total)} of {currency.format(catBudgetVal)})
                                      </>
                                    ) : (
                                      `${budgetShare.toFixed(0)}% of monthly budget`
                                    )}
                                  </span>
                                  {isOpen && (
                                    <button
                                      type="button"
                                      className="btn-edit-budget-trigger"
                                      onClick={() => {
                                        setEditingCategory(category.name);
                                        setEditingBudgetVal(hasCatBudget ? String(catBudgetVal) : "");
                                      }}
                                    >
                                      {hasCatBudget ? "✏️ Edit Budget" : "➕ Set Budget"}
                                    </button>
                                  )}
                                </div>
                              )}
                              <b>{hasCatBudget ? currency.format(catBudgetVal) : currency.format(monthlyBudget)}</b>
                            </div>
                          </>
                        );
                      })()}

                      {isOpen && (
                        <div className="transaction-list">
                          {category.items.map((tx) => (
                            <div className="transaction-row" key={tx.id}>
                              <span>
                                <strong>{tx.name}</strong>
                                <small>{tx.dateLabel}</small>
                              </span>
                              <b>{currency.format(tx.amount)}</b>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}
      </section>

      {/* Google Sheets Connector Drawer Overlay */}
      <div 
        className={`connector-overlay ${isConnectorOpen ? "is-open" : ""}`} 
        onClick={() => setIsConnectorOpen(false)} 
      />
      <aside className={`connector-drawer ${isConnectorOpen ? "is-open" : ""}`} aria-label="Sheet Connector">
        <div className="drawer-header">
          <h2>Google Sheets Connection Center</h2>
          <button className="btn-close-drawer" onClick={() => setIsConnectorOpen(false)} type="button">
            &times;
          </button>
        </div>

        <div className="drawer-body">
          <p className="drawer-intro">
            Connect any shared Google Sheet to visualize your transactions in real-time.
          </p>

          <form onSubmit={handleConnectSheet} className="connector-form">
            <label className="budget-input">
              <span>Google Sheet URL or ID</span>
              <input
                required
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                value={sheetUrlInput}
                onChange={(e) => setSheetUrlInput(e.target.value)}
              />
            </label>

            <label className="budget-input">
              <span>Sheet Tab Name (case-sensitive)</span>
              <input
                required
                type="text"
                placeholder="e.g., Expense"
                value={sheetTabInput}
                onChange={(e) => setSheetTabInput(e.target.value)}
              />
            </label>

            {connectorStatus === "checking" && (
              <div className="connector-diagnostic diagnostic-checking">
                <span className="spinner">🌀</span> Connecting and validating sheet columns...
              </div>
            )}

            {connectorStatus === "success" && (
              <div className="connector-diagnostic diagnostic-success">
                ✅ Connected successfully! loaded data from sheet.
              </div>
            )}

            {connectorStatus === "error" && (
              <div className="connector-diagnostic diagnostic-error">
                ❌ <strong>Error:</strong> {connectorError}
              </div>
            )}

            <div className="drawer-actions">
              <button
                type="submit"
                className="btn-primary-gradient"
                disabled={connectorStatus === "checking"}
              >
                Connect Sheet
              </button>
              
              {isCustomActive && (
                <button
                  type="button"
                  className="btn-danger-badge"
                  onClick={handleResetToDemo}
                >
                  Disconnect & Use Demo Sheet
                </button>
              )}
            </div>
          </form>

          <hr className="drawer-divider" />

          <section className="guide-section">
            <h3>📖 How to share your Google Sheet</h3>
            <ol className="sharing-steps">
              <li>
                Open your Google Sheet and click the blue <strong>Share</strong> button in the top right.
              </li>
              <li>
                Under <em>General access</em>, change restriction to <strong>"Anyone with the link can view"</strong>.<br />
                <small className="warning-text">⚠️ If set to Restricted, the dashboard won't be able to retrieve the data.</small>
              </li>
              <li>
                Make sure the sheet contains columns titled exactly: <strong>Date</strong>, <strong>Expense</strong> (or <em>Item</em>), <strong>Amount</strong>, and <strong>Category</strong>.
              </li>
              <li>
                Copy the browser link and paste it into the form above!
              </li>
            </ol>
          </section>
        </div>
      </aside>
    </main>
  );
}
