import React, { useEffect, useMemo, useState } from "react";
import { PlusCircle, Trash2, Pencil, Download, Wallet, CalendarDays, BarChart3, PieChart as PieIcon, DollarSign, RefreshCcw, CreditCard, Landmark, AlertCircle } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from "recharts";

// --- Types ---
type Txn = {
  id: string;
  amount: number; // positive = spend; (you can add income later)
  category: string;
  date: string; // yyyy-mm-dd
  note?: string;
};

type Budget = {
  category: string;
  monthlyLimit: number; // 0 = no limit
};

// NEW: Liability types
type LoanAccount = {
  id: string;
  name: string;            // e.g., "Car Loan"
  principal: number;       // original amount
  balance: number;         // current outstanding
  apr: number;             // e.g., 7.5 (annual %)
  termMonths?: number;     // optional
  dueDay: number;          // day of month payment due (1-28/31)
  startDate?: string;      // yyyy-mm-dd
};

type CreditCardAccount = {
  id: string;
  name: string;            // e.g., "Chase Freedom"
  limit: number;           // credit limit
  balance: number;         // current statement balance (or running)
  apr: number;             // annual %
  stmtDay: number;         // statement generates on this day
  dueDay: number;          // payment due day (often ~21 days after stmt)
  minPct?: number;         // e.g., 0.03 (3%)
};

// --- Storage Keys ---
const LS_TXNS = "spendmate_txns_v1";
const LS_BUDGETS = "spendmate_budgets_v1";
const LS_LOANS = "spendmate_loans_v1";
const LS_CARDS = "spendmate_cards_v1";

const DEFAULT_CATEGORIES = [
  "Food",
  "Groceries",
  "Transport",
  "Shopping",
  "Housing",
  "Utilities",
  "Health",
  "Entertainment",
  "Education",
  "Other",
  "Loan Payment",
  "Credit Card Payment",
];

// --- Utilities ---
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatCurrency(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthKey(d: string) {
  // yyyy-mm
  return d.slice(0, 7);
}

function startOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
}
function endOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return x.toISOString().slice(0, 10);
}

function toCSV(rows: (string | number)[][]) {
  return rows
    .map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function clampDay(y: number, m: number, d: number) {
  const last = new Date(y, m + 1, 0).getDate();
  return Math.min(d, last);
}

function nextDueDate(day: number, fromDate = new Date()) {
  // Returns the next date (>= today) with the given day-of-month
  const y = fromDate.getFullYear();
  const m = fromDate.getMonth();
  const todayDay = fromDate.getDate();
  if (todayDay <= day) {
    return new Date(y, m, clampDay(y, m, day));
  }
  const ny = m === 11 ? y + 1 : y;
  const nm = (m + 1) % 12;
  return new Date(ny, nm, clampDay(ny, nm, day));
}

// --- Main Component ---
export default function App() {
  const [currency, setCurrency] = useState("USD");

  // Transactions & Budgets
  const [txns, setTxns] = useState<Txn[]>(() => {
    try { const raw = localStorage.getItem(LS_TXNS); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [budgets, setBudgets] = useState<Budget[]>(() => {
    try { const raw = localStorage.getItem(LS_BUDGETS); return raw ? JSON.parse(raw) : DEFAULT_CATEGORIES.map(c => ({ category: c, monthlyLimit: 0 })); } catch { return DEFAULT_CATEGORIES.map(c => ({ category: c, monthlyLimit: 0 })); }
  });

  // NEW: Loans & Cards
  const [loans, setLoans] = useState<LoanAccount[]>(() => {
    try { const raw = localStorage.getItem(LS_LOANS); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [cards, setCards] = useState<CreditCardAccount[]>(() => {
    try { const raw = localStorage.getItem(LS_CARDS); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });

  const [filterMonth, setFilterMonth] = useState(() => monthKeyFromDate(new Date()));
  const [editing, setEditing] = useState<Txn | null>(null);

  React.useEffect(() => { localStorage.setItem(LS_TXNS, JSON.stringify(txns)); }, [txns]);
  React.useEffect(() => { localStorage.setItem(LS_BUDGETS, JSON.stringify(budgets)); }, [budgets]);
  React.useEffect(() => { localStorage.setItem(LS_LOANS, JSON.stringify(loans)); }, [loans]);
  React.useEffect(() => { localStorage.setItem(LS_CARDS, JSON.stringify(cards)); }, [cards]);

  const categories = React.useMemo(() => {
    const fromBudgets = budgets.map(b => b.category);
    const fromTxns = Array.from(new Set(txns.map(t => t.category)));
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...fromBudgets, ...fromTxns]));
  }, [budgets, txns]);

  const monthRange = React.useMemo(() => {
    const [y, m] = filterMonth.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10) };
  }, [filterMonth]);

  const monthTxns = React.useMemo(() => txns.filter(t => t.date >= monthRange.startISO && t.date <= monthRange.endISO), [txns, monthRange]);
  const totalMonthSpend = React.useMemo(() => monthTxns.reduce((sum, t) => sum + Math.max(0, t.amount), 0), [monthTxns]);

  const byCategory = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of monthTxns) m.set(t.category, (m.get(t.category) || 0) + t.amount);
    return Array.from(m.entries()).map(([category, amount]) => ({ category, amount }));
  }, [monthTxns]);

  const dailySeries = React.useMemo(() => {
    const days: Record<string, number> = {};
    let d = new Date(monthRange.startISO);
    const end = new Date(monthRange.endISO);
    while (d <= end) { const key = d.toISOString().slice(0, 10); days[key] = 0; d.setDate(d.getDate() + 1); }
    for (const t of monthTxns) days[t.date] = (days[t.date] || 0) + t.amount;
    return Object.entries(days).map(([date, amount]) => ({ date: date.slice(5), amount }));
  }, [monthTxns, monthRange]);

  function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function upsertTxn(input: Omit<Txn, "id"> & { id?: string }) {
    const clean: Txn = {
      id: input.id ?? uid(),
      amount: Math.abs(Number(input.amount)) || 0,
      category: input.category || "Other",
      date: input.date || new Date().toISOString().slice(0, 10),
      note: input.note?.trim() || "",
    };
    setTxns(prev => {
      const idx = prev.findIndex(p => p.id === clean.id);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = clean; return copy; }
      return [clean, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1));
    });
    setEditing(null);
  }

  function removeTxn(id: string) { setTxns(prev => prev.filter(t => t.id !== id)); }

  function exportCSV() {
    const header = ["id", "date", "category", "amount", "note"];
    const rows = txns.map(t => [t.id, t.date, t.category, t.amount, t.note || ""]);
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spending_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function resetAll() {
    if (!confirm("This will clear all data (transactions + budgets + loans + cards). Continue?")) return;
    setTxns([]);
    setBudgets(DEFAULT_CATEGORIES.map(c => ({ category: c, monthlyLimit: 0 })));
    setLoans([]);
    setCards([]);
  }

  function payLoan(loanId: string, amount: number, date: string, note?: string) {
    setLoans(prev => prev.map(l => l.id === loanId ? { ...l, balance: Math.max(0, Number((l.balance - amount).toFixed(2))) } : l));
    const loan = loans.find(l => l.id === loanId);
    upsertTxn({ amount, category: "Loan Payment", date, note: `${loan?.name || 'Loan'}${note ? ' - ' + note : ''}` });
  }

  function payCard(cardId: string, amount: number, date: string, note?: string) {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, balance: Math.max(0, Number((c.balance - amount).toFixed(2))) } : c));
    const card = cards.find(c => c.id === cardId);
    upsertTxn({ amount, category: "Credit Card Payment", date, note: `${card?.name || 'Card'}${note ? ' - ' + note : ''}` });
  }

  const budgetsByCat = new Map(budgets.map(b => [b.category, b.monthlyLimit]));
  const budgetUsage = (() => {
    const usage = new Map<string, number>();
    for (const { category, amount } of byCategory) usage.set(category, amount);
    return usage;
  })();

  const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff7f7f", "#8dd1e1", "#a4de6c", "#d0ed57", "#ffc0cb", "#c0caf5", "#b6e3ff"];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Wallet className="w-8 h-8" />
            <h1 className="text-2xl font-semibold">SpendMate – Daily Spending Tracker</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-300">Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
              {[ "USD","EUR","INR","GBP","AUD","CAD","JPY","AED" ].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={exportCSV} className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-3 py-2">
              <Download className="w-4 h-4"/> Export CSV
            </button>
            <button onClick={resetAll} className="inline-flex items-center gap-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800 rounded-xl px-3 py-2">
              <RefreshCcw className="w-4 h-4"/> Reset
            </button>
          </div>
        </header>

        {/* Filters & Quick Add */}
        <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="w-5 h-5"/>
              <h2 className="font-medium">Month</h2>
            </div>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
            <p className="text-xs text-slate-400 mt-2">Showing {/*start*/} to {/*end*/}</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <PlusCircle className="w-5 h-5"/>
              <h2 className="font-medium">Add Transaction</h2>
            </div>
            {/* ... form omitted in this embedded summary ... */}
            <div className="text-slate-400 text-sm">Form content here (same as Canvas App).</div>
          </div>
        </section>

        <div className="mt-6 text-slate-300">
          For the full App, use the Canvas version you've been editing.
        </div>
      </div>
    </div>
  );
}