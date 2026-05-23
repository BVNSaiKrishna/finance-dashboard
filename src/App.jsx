import { useEffect, useMemo, useState } from "react";
import "./App.css";

const DEFAULT_SHEET_URL =
  "https://opensheet.elk.sh/10A8amXj7QMzCfByz3Craq5dTnqwabD-0eN2v7ppoIsc/Expense";

const SHEET_URL = import.meta.env.VITE_SHEET_URL || DEFAULT_SHEET_URL;

const palette = ["#f8d66d", "#5eead4", "#a78bfa", "#fb7185", "#7dd3fc", "#86efac"];

const DEFAULT_MONTHLY_BUDGET = 50000;
const BUDGET_STORAGE_KEY = "finance-dashboard-monthly-budget";
const LOCAL_TX_STORAGE_KEY = "finance-dashboard-local-transactions";

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
  const date = parseDate(tx.Date);

  return {
    id: `${tx.Date ?? "unknown"}-${tx.Expense ?? "expense"}-${tx.Amount ?? index}-${index}`,
    amount: parseAmount(tx.Amount),
    category: tx.Category?.trim() || "Other",
    date,
    dateLabel: tx.Date || "No date",
    dayKey: date ? getDayKey(date) : "undated",
    name: tx.Expense?.trim() || "Untitled expense",
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

  // Sandbox Simulator Form States
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  const [newExpenseDate, setNewExpenseDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);

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
        const response = await fetch(SHEET_URL);

        if (!response.ok) {
          throw new Error(`Sheet request failed: ${response.status}`);
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
  }, []);

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
              Live spending intelligence from your expense sheet.
            </p>
          </div>

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
                <span className="section-label">Month total</span>
                <strong>{currency.format(monthlyTotal)}</strong>
                <small>Before filters</small>
              </article>

              <article className="insight-panel">
                <span className="section-label">Highest day</span>
                <strong>
                  {highestDay.date ? dayFormatter.format(highestDay.date) : "None"}
                </strong>
                <small>{currency.format(highestDay.total)}</small>
              </article>

              <article className="insight-panel">
                <span className="section-label">Month compare</span>
                <strong>
                  {previousMonth
                    ? `${monthChange >= 0 ? "+" : "-"}${currency.format(Math.abs(monthChange))}`
                    : "New"}
                </strong>
                <small>
                  {previousMonth
                    ? `${Math.abs(monthChangePercent).toFixed(0)}% ${monthChange >= 0 ? "higher" : "lower"
                    } than previous month`
                    : "No previous month to compare"}
                </small>
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

                      <div className="progress-track">
                        <span
                          className="progress-fill"
                          style={{
                            backgroundColor: color,
                            width: `${progress}%`,
                          }}
                        />
                      </div>

                      <div className="budget-row">
                        <span>
                          {budgetShare.toFixed(0)}% of monthly budget
                        </span>
                        <b>{currency.format(monthlyBudget)}</b>
                      </div>

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
    </main>
  );
}
