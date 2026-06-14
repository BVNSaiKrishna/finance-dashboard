import { useEffect, useRef, useState } from "react";
import { callLLM } from "../services/llm";

// Recreate Mini icons locally to ensure no missing exports
const CustomMiniKatana = ({ color = "#FFD700", size = 40 }) => (
  <svg width={size} height={12} viewBox="0 0 70 12" fill="none" style={{ filter: `drop-shadow(0 0 3px ${color}77)` }}>
    <path d="M7 5 L62 4 L68 6 L62 8 L7 7 Z" fill={color} opacity="0.85"/>
    <path d="M62 4 L70 6 L62 8 Z" fill={color}/>
    <ellipse cx="7" cy="6" rx="2.5" ry="5" fill="#4a3508" stroke={color} strokeWidth="0.5"/>
    <rect x="1" y="3.5" width="6" height="5" rx="0.5" fill="#14080a"/>
  </svg>
);

const CustomBolt = ({ size = 12, color = "#FFD700" }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 22 30" fill="none">
    <path d="M14 2L4 17H11L8 28L19 12H12L14 2Z" fill={color}/>
  </svg>
);

const CustomDroplet = ({ size = 10, color = "#00AADD" }) => (
  <svg width={size} height={size * 1.3} viewBox="0 0 18 24" fill="none">
    <path d="M9 1 Q16 10 16 15 A7 7 0 0 1 2 15 Q2 10 9 1 Z" fill={color} opacity="0.85"/>
  </svg>
);

const toolsList = [
  {
    name: "get_financial_ledger",
    description: "Get the current financial ledger metrics, including monthly budget, total spent, remaining balance, and a breakdown of category expenses.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "add_spending_strike",
    description: "Record a new expense (spending strike) to the Google Sheet ledger.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The item or expense description (e.g., Coffee, Katana Polish)." },
        amount: { type: "number", description: "The cost/amount in INR (e.g., 250)." },
        category: { type: "string", description: "The expense category/breathing form (e.g., Food, Travel, Investments, Utilities, Groceries, dryfruits, Snacks)." },
        date: { type: "string", description: "Date of transaction in YYYY-MM-DD format (optional, defaults to today)." },
        paymentType: { type: "string", description: "Payment type used (e.g., UPI, Cash, Credit Card, Debit Card). Defaults to UPI." }
      },
      required: ["name", "amount", "category"]
    }
  },
  {
    name: "filter_dashboard",
    description: "Filter the transactions shown on the dashboard by category, month (YYYY-MM), or a general query.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category name, or 'all' to clear category filter." },
        query: { type: "string", description: "Search query text (e.g. 'coffee'), or empty string to clear." },
        month: { type: "string", description: "Filter by month key in YYYY-MM format (e.g., '2026-06')." }
      }
    }
  },
  {
    name: "update_budget",
    description: "Update the monthly budget limit.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "The new monthly budget in INR (e.g. 50000)." }
      },
      required: ["amount"]
    }
  },
  {
    name: "export_csv_report",
    description: "Triggers a download of the current filtered transaction report as a CSV file.",
    parameters: {
      type: "object",
      properties: {}
    }
  }
];

export default function AIAssistant({
  isOpen,
  onClose,
  theme,
  themes,
  activeMonth,
  totalSpent,
  monthlyBudget,
  budgetRemaining,
  groupedCategories,
  onAddExpense,
  onSetCategoryFilter,
  onSetSearchQuery,
  onSetMonthFilter,
  onSetBudget,
  onExportCSV,
  onOpenSettings
}) {
  const T = themes[theme];
  
  // Storage keys for active providers
  const [provider] = useState(() => localStorage.getItem("finance-dashboard-llm-provider") || "gemini");
  const [apiKey, setApiKey] = useState("");
  
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Sync API key on load and when provider/panel changes
  useEffect(() => {
    const currentProvider = localStorage.getItem("finance-dashboard-llm-provider") || "gemini";
    const keyName = currentProvider === "gemini" ? "finance-dashboard-gemini-key" : "finance-dashboard-openai-key";
    setApiKey(localStorage.getItem(keyName) || "");
  }, [isOpen, provider]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const chatbotName = theme === "zenitsu" ? "CHUNTARO \u{1F426}" : "KASUGAI CROW \u{1F985}";
  const systemInstruction = theme === "zenitsu"
    ? "You are Chuntaro, Zenitsu's faithful sparrow messenger. You speak to Zenitsu in a helpful but slightly chirpy, squeaky voice (using occasional *chirp* or *squeak*). You are smart, concerned about Zenitsu spending too much on snacks, and advise them on how to keep their budget in check. Use first person, keep answers focused, and use tools to manage the dashboard whenever requested."
    : "You are the Kasugai Crow, the serious and loud crow messenger of the Demon Slayer Corps. You command financial discipline! Speak in a bold, direct, and slightly theatrical corps-messenger tone. Help the slayer keep track of their spending strikes to prepare for combat. Keep answers brief and clear, and use tools to execute commands.";

  // Handle local tool execution
  async function executeTool(name, args) {
    console.log(`Executing tool: ${name}`, args);
    try {
      switch (name) {
        case "get_financial_ledger":
          const categoriesBreakdown = groupedCategories.map(c => `${c.name}: INR ${c.total}`).join(", ");
          return JSON.stringify({
            status: "success",
            monthlyBudget,
            totalSpent,
            budgetRemaining,
            activeMonth,
            categoriesBreakdown
          });
          
        case "add_spending_strike":
          // Re-map YYYY-MM-DD date to DD/MM/YYYY if provided
          let dateStr = "";
          if (args.date) {
            const parts = args.date.split("-");
            if (parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
          }
          await onAddExpense({
            name: args.name,
            amount: args.amount,
            category: args.category,
            date: dateStr || undefined,
            paymentType: args.paymentType || "UPI"
          });
          return JSON.stringify({
            status: "success",
            message: `Logged: ${args.name} (INR ${args.amount}) under category ${args.category}`
          });
          
        case "filter_dashboard":
          if (args.category !== undefined) onSetCategoryFilter(args.category);
          if (args.query !== undefined) onSetSearchQuery(args.query);
          if (args.month !== undefined) onSetMonthFilter(args.month);
          return JSON.stringify({ status: "success", message: "Dashboard filters updated." });
          
        case "update_budget":
          onSetBudget(args.amount);
          return JSON.stringify({ status: "success", message: `Budget updated to INR ${args.amount}` });
          
        case "export_csv_report":
          onExportCSV();
          return JSON.stringify({ status: "success", message: "CSV report triggered successfully." });
          
        default:
          return JSON.stringify({ status: "error", message: `Unknown tool: ${name}` });
      }
    } catch (err) {
      console.error(err);
      return JSON.stringify({ status: "error", message: err.message || "Failed to execute tool." });
    }
  }

  // AI request loop
  async function sendMessage(e) {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMsg];
    
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const activeProvider = localStorage.getItem("finance-dashboard-llm-provider") || "gemini";
      const keyName = activeProvider === "gemini" ? "finance-dashboard-gemini-key" : "finance-dashboard-openai-key";
      const activeKey = localStorage.getItem(keyName) || "";

      if (!activeKey) {
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: `\u{26A0} API Key is missing for ${activeProvider.toUpperCase()}! Please configure it in your Settings to activate my messenger service.` }
        ]);
        setLoading(false);
        return;
      }

      // Step 1: Request to LLM
      let response = await callLLM({
        provider: activeProvider,
        apiKey: activeKey,
        messages: updatedMessages,
        tools: toolsList,
        systemInstruction
      });

      // Step 2: Loop tool calling until standard text is returned
      let currentMessages = [...updatedMessages];
      let iterations = 0;
      const maxIterations = 5;

      while (response.type === "tool_calls" && iterations < maxIterations) {
        iterations++;
        
        // Add model tool requests to messages log
        const toolRequestMsg = { role: "assistant", toolCalls: response.toolCalls };
        currentMessages.push(toolRequestMsg);
        
        // Execute all returned tool calls
        const toolResponses = [];
        for (const tc of response.toolCalls) {
          const result = await executeTool(tc.name, tc.args);
          toolResponses.push({
            role: "tool",
            toolCallId: tc.id,
            name: tc.name,
            content: result
          });
        }
        
        // Add tool results to messages log
        currentMessages = [...currentMessages, ...toolResponses];
        setMessages(currentMessages);

        // Call LLM again with tool results
        response = await callLLM({
          provider: activeProvider,
          apiKey: activeKey,
          messages: currentMessages,
          tools: toolsList,
          systemInstruction
        });
      }

      if (response.type === "text") {
        setMessages(prev => [...prev, { role: "assistant", content: response.text }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `\u{274C} Communication failed: ${err.message || "Something went wrong. Check your API key or network."}` }
      ]);
    } finally {
      setLoading(false);
    }
  }

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear the conversation history?")) {
      setMessages([]);
    }
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 999
          }}
        />
      )}

      <aside
        style={{
          position: "fixed",
          top: 0,
          right: isOpen ? 0 : "-400px",
          width: "100%",
          maxWidth: "380px",
          height: "100vh",
          background: T.panel,
          borderLeft: `1px solid ${T.primary}33`,
          boxShadow: `-10px 0 30px rgba(0,0,0,0.6)`,
          zIndex: 1000,
          padding: "24px 20px",
          overflow: "hidden",
          transition: "right 0.3s ease-in-out, background 0.5s, border-left-color 0.5s",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {theme === "zenitsu" ? <CustomBolt size={14} color={T.primary}/> : <CustomDroplet size={12} color={T.primary}/>}
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: T.primary, fontSize: "18px", margin: 0, fontWeight: 700 }}>
              {chatbotName}
            </h2>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {messages.length > 0 && (
              <button
                onClick={handleClearHistory}
                type="button"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ff4444",
                  fontSize: "10px",
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                CLEAR
              </button>
            )}
            <button
              onClick={onClose}
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
        </div>

        {/* Messaging Area */}
        <div
          style={{
            flex: 1,
            background: T.raised,
            border: `1px solid ${T.primary}11`,
            borderRadius: "12px",
            padding: "16px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginBottom: "16px"
          }}
        >
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", opacity: 0.6, textAlign: "center", gap: "8px" }}>
              <CustomMiniKatana color={`${T.primary}55`} size={50}/>
              <p style={{ color: "#d0cce8", fontSize: "12px", margin: 0, padding: "0 10px" }}>
                Send a message to consult your Crow or Sparrow messenger! Ask questions about your ledger or request actions like adding a spending strike.
              </p>
              {!apiKey && (
                <button
                  onClick={onOpenSettings}
                  type="button"
                  style={{
                    background: "transparent",
                    color: T.primary,
                    border: `1px solid ${T.primary}44`,
                    borderRadius: "20px",
                    padding: "6px 12px",
                    fontSize: "10px",
                    marginTop: "10px",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Configure API Key
                </button>
              )}
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.role === "system" || msg.role === "tool" || msg.role === "function") return null;

            // Handle display of tool logs
            if (msg.toolCalls) {
              return (
                <div key={i} style={{ alignSelf: "flex-start", maxWidth: "90%", background: "rgba(255, 255, 255, 0.03)", border: `1px dashed ${T.primary}22`, borderRadius: "8px", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "9px", fontFamily: "'JetBrains Mono', monospace", color: `${T.primary}88` }}>
                    ⚙️ Executing Strike tools:
                  </span>
                  {msg.toolCalls.map((tc, tcIdx) => (
                    <span key={tcIdx} style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#6a6a9a" }}>
                      ↳ {tc.name}(...)
                    </span>
                  ))}
                </div>
              );
            }

            const isUser = msg.role === "user";
            return (
              <div
                key={i}
                style={{
                  alignSelf: isUser ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: isUser ? `${T.primary}1a` : "rgba(255,255,255,0.05)",
                  border: isUser ? `1px solid ${T.primary}33` : "1px solid rgba(255,255,255,0.05)",
                  borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  padding: "10px 12px",
                  fontSize: "12px",
                  color: isUser ? "#fff" : "#e0e0f5",
                  lineHeight: 1.4,
                  wordBreak: "break-word"
                }}
              >
                {msg.content}
              </div>
            );
          })}

          {loading && (
            <div style={{ alignSelf: "flex-start", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "8px 8px 8px 2px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ animation: "pulsePrimary 1.2s infinite", display: "inline-block", fontSize: "12px" }}>🐦</span>
              <span style={{ fontSize: "11px", color: T.dim, fontStyle: "italic" }}>Messenger is writing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form onSubmit={sendMessage} style={{ display: "flex", gap: "8px" }}>
          <input
            required
            type="text"
            placeholder={apiKey ? "Ask messenger..." : "API key required..."}
            value={input}
            disabled={!apiKey || loading}
            onChange={(e) => setInput(e.target.value)}
            style={{
              flex: 1,
              background: T.raised,
              color: "#fff",
              border: `1px solid ${T.primary}22`,
              borderRadius: "10px",
              padding: "12px",
              fontSize: "12px",
              outline: "none"
            }}
          />
          <button
            type="submit"
            disabled={!apiKey || loading || !input.trim()}
            style={{
              background: T.switchBg,
              color: T.switchText,
              border: "none",
              borderRadius: "10px",
              padding: "0 16px",
              fontWeight: 700,
              fontSize: "11px",
              fontFamily: "'Inter', sans-serif",
              cursor: (!apiKey || loading || !input.trim()) ? "not-allowed" : "pointer",
              opacity: (!apiKey || loading || !input.trim()) ? 0.5 : 1,
              transition: "all 0.2s"
            }}
          >
            SEND
          </button>
        </form>
      </aside>
    </>
  );
}
