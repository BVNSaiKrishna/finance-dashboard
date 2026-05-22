import { useEffect, useMemo, useState } from "react";
import "./App.css";

const SHEET_URL =
  "https://opensheet.elk.sh/10A8amXj7QMzCfByz3Craq5dTnqwabD-0eN2v7ppoIsc/Expense";

const palette = ["#f8d66d", "#5eead4", "#a78bfa", "#fb7185", "#7dd3fc"];

const currency = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "INR",
});

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
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

function normalizeTransaction(tx, index) {
  const date = parseDate(tx.Date);

  return {
    id: `${tx.Date ?? "unknown"}-${tx.Expense ?? "expense"}-${tx.Amount ?? index}-${index}`,
    amount: parseAmount(tx.Amount),
    category: tx.Category?.trim() || "Other",
    date,
    dateLabel: tx.Date || "No date",
    name: tx.Expense?.trim() || "Untitled expense",
    monthKey: date ? getMonthKey(date) : "undated",
    raw: tx,
  };
}

function sortByDateDesc(a, b) {
  return (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
}

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [selectedMonth, setSelectedMonth] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTransactions() {
      try {
        setStatus("loading");
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

  const monthOptions = useMemo(() => {
    const options = new Map();

    transactions.forEach((tx) => {
      if (!tx.date) return;
      options.set(tx.monthKey, monthFormatter.format(tx.date));
    });

    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [transactions]);

  const activeMonth = selectedMonth || monthOptions[0]?.value || "";

  const visibleTransactions = useMemo(() => {
    if (!activeMonth) return [];
    return transactions.filter((tx) => tx.monthKey === activeMonth);
  }, [activeMonth, transactions]);

  const groupedCategories = useMemo(() => {
    const grouped = visibleTransactions.reduce((acc, tx) => {
      acc[tx.category] ??= [];
      acc[tx.category].push(tx);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, items]) => ({
        name,
        items,
        total: items.reduce((sum, tx) => sum + tx.amount, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [visibleTransactions]);

  const totalSpent = visibleTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const averageSpend =
    visibleTransactions.length > 0 ? totalSpent / visibleTransactions.length : 0;
  const topCategory = groupedCategories[0];
  const currentMonthLabel =
    monthOptions.find((month) => month.value === activeMonth)?.label ||
    "Select a month";

  const toggle = (name) => {
    setExpanded((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
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
                setExpanded({});
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
                <span>Total spent</span>
                <strong>{currency.format(totalSpent)}</strong>
                <small>{visibleTransactions.length} transactions</small>
              </article>

              <article className="metric-card">
                <span>Average</span>
                <strong>{currency.format(averageSpend)}</strong>
                <small>Per transaction</small>
              </article>

              <article className="metric-card">
                <span>Top category</span>
                <strong>{topCategory?.name || "None"}</strong>
                <small>
                  {topCategory ? currency.format(topCategory.total) : "No spend"}
                </small>
              </article>
            </section>

            {visibleTransactions.length === 0 ? (
              <div className="state-panel">No expenses found for this month.</div>
            ) : (
              <section className="category-list" aria-label="Category breakdown">
                {groupedCategories.map((category, index) => {
                  const color = palette[index % palette.length];
                  const isOpen = Boolean(expanded[category.name]);
                  const progress =
                    totalSpent > 0 ? (category.total / totalSpent) * 100 : 0;

                  return (
                    <article className="category-card" key={category.name}>
                      <button
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
