import AuthPanel from "./components/AuthPanel";
import React, { useEffect, useMemo, useState } from "react";
import { PlusCircle, Trash2, Pencil, Download, Wallet, CalendarDays, BarChart3, PieChart as PieIcon, DollarSign, RefreshCcw, CreditCard, Landmark, AlertCircle } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from "recharts";
import { supabase } from "./lib/supabaseClient";  // make sure this path matches your setup
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
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
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
// 1. User state & auth listener
const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null);

useEffect(() => {
  (async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user ?? null);
    if (!user) clearAllData();
  })();

  const sub = supabase.auth.onAuthStateChange((event, session) => {
    const nextUser = session?.user ?? null;
    setUser(nextUser);
    if (event === "SIGNED_OUT" || !nextUser) {
      clearAllData();
    }
  });

  return () => { sub.data.subscription.unsubscribe(); };
}, []);

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
  const safeTxns = user ? txns : [];
  function clearAllData() {
  setTxns([]);
  setLoans([]);
  setCards([]);
  // optional: also clear localStorage so it doesn't come back on refresh
  localStorage.removeItem(LS_TXNS);
  localStorage.removeItem(LS_LOANS);
  localStorage.removeItem(LS_CARDS);
}
  const [filterMonth, setFilterMonth] = useState(() => monthKeyFromDate(new Date()));
  const [editing, setEditing] = useState<Txn | null>(null);
  // Try loading transactions from Supabase (if env vars + policies allow)
// 2. Load only signed-in user’s transactions
useEffect(() => {
  (async () => {
    try {
      if (!supabase || !user) return;
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, category, txn_date, note')
        .eq('user_id', user.id)
        .order('txn_date', { ascending: false });
      if (!error && data) {
        setTxns(data.map(d => ({
          id: d.id as string,
          amount: Number(d.amount),
          category: d.category as string,
          date: d.txn_date as string,
          note: (d as any).note || ''
        })));
      }
    } catch (e) {
      console.warn('Supabase load skipped:', e);
    }
  })();
}, [user]);

  useEffect(() => { localStorage.setItem(LS_TXNS, JSON.stringify(txns)); }, [txns]);
  useEffect(() => { localStorage.setItem(LS_BUDGETS, JSON.stringify(budgets)); }, [budgets]);
  useEffect(() => { localStorage.setItem(LS_LOANS, JSON.stringify(loans)); }, [loans]);
  useEffect(() => { localStorage.setItem(LS_CARDS, JSON.stringify(cards)); }, [cards]);

  const categories = useMemo(() => {
    const fromBudgets = budgets.map(b => b.category);
    const fromTxns = Array.from(new Set(safeTxns.map(t => t.category)));
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...fromBudgets, ...fromTxns]));
  }, [budgets, safeTxns]);


  const monthRange = useMemo(() => {
    const [y, m] = filterMonth.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10) };
  }, [filterMonth]);

  const monthTxns = useMemo(
  () => safeTxns.filter(t => t.date >= monthRange.startISO && t.date <= monthRange.endISO),
  [safeTxns, monthRange]);

  const totalMonthSpend = useMemo(() => monthTxns.reduce((sum, t) => sum + Math.max(0, t.amount), 0), [monthTxns]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of monthTxns) m.set(t.category, (m.get(t.category) || 0) + t.amount);
    return Array.from(m.entries()).map(([category, amount]) => ({ category, amount }));
  }, [monthTxns]);

  const dailySeries = useMemo(() => {
    const days: Record<string, number> = {};
    let d = new Date(monthRange.startISO);
    const end = new Date(monthRange.endISO);
    while (d <= end) { const key = d.toISOString().slice(0, 10); days[key] = 0; d.setDate(d.getDate() + 1); }
    for (const t of monthTxns) days[t.date] = (days[t.date] || 0) + t.amount;
    return Object.entries(days).map(([date, amount]) => ({ date: date.slice(5), amount }));
  }, [monthTxns, monthRange]);

async function upsertTxn(input: Omit<Txn, "id"> & { id?: string }) {
  // Build a clean payload for the DB
  const payload: any = {
    user_id: user?.id,                       // required for RLS
    amount: Math.abs(Number(input.amount)) || 0,
    category: input.category || "Other",
    txn_date: input.date || new Date().toISOString().slice(0,10),
    note: input.note?.trim() || "",
  };

  // Only send id if it's an edit and you already have a valid UUID from the DB
  if (input.id) payload.id = input.id;

  // Optimistic UI (insert/update locally so the UI feels instant)
  setTxns(prev => {
    const idForUI = input.id ?? "(pending)";
    const clean: Txn = {
      id: idForUI,
      amount: payload.amount,
      category: payload.category,
      date: payload.txn_date,
      note: payload.note,
    };
    const idx = prev.findIndex(p => p.id === clean.id);
    if (idx >= 0) { const copy = [...prev]; copy[idx] = clean; return copy; }
    return [clean, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1));
  });
  setEditing(null);

  // Persist to Supabase – require auth and show any errors
  try {
    if (!supabase || !user) return;

    // Let the DB assign id for new rows. Ask it to return the row.
    const { data, error } = await supabase
      .from("transactions")
      .upsert(payload)         // payload has no id for new inserts
      .select("*")             // get the real row back
      .single();

    if (error) {
      console.error("Upsert error:", error);
      alert(`Save failed: ${error.message}`);
      // Optional: revert the optimistic row here if you want
      return;
    }

    // Reconcile optimistic row with the authoritative row from DB
    setTxns(prev => {
      const idx = prev.findIndex(p => p.id === (input.id ?? "(pending)"));
      const cleanFromDB: Txn = {
        id: data.id as string,
        amount: Number(data.amount),
        category: String(data.category),
        date: String(data.txn_date),
        note: (data as any).note || "",
      };
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = cleanFromDB;
        return copy;
      }
      return [cleanFromDB, ...prev];
    });
  } catch (e) {
    console.error("Supabase upsert exception:", e);
    alert("Save failed (network/client error). Check console.");
  }
}

async function removeTxn(id: string) {
  setTxns(prev => prev.filter(t => t.id !== id));
  try {
    if (!supabase || !user) return;
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      console.error("Delete error:", error);
      alert(`Delete failed: ${error.message}`);
    }
  } catch (e) {
    console.error("Delete exception:", e);
    alert("Delete failed (network/client error).");
  }
}

function exportCSV() {
  const header = ["id", "date", "category", "amount", "note"];
  const rows = safeTxns.map(t => [t.id, t.date, t.category, t.amount, t.note || ""]);
  const csv = toCSV([header, ...rows]);

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spending_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
  function resetAll() {
    if (!confirm("This will clear all data (transactions + budgets + loans + cards). Continue?")) return;
    setTxns([]);
    setBudgets(DEFAULT_CATEGORIES.map(c => ({ category: c, monthlyLimit: 0 })));
    setLoans([]);
    setCards([]);
  }

  // --- NEW: Payments that also update loan/card balances ---
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

  const budgetsByCat = useMemo(() => new Map(budgets.map(b => [b.category, b.monthlyLimit])), [budgets]);
  const budgetUsage = useMemo(() => {
    const usage = new Map<string, number>();
    for (const { category, amount } of byCategory) usage.set(category, amount);
    return usage;
  }, [byCategory]);

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
              {[
                "USD","EUR","INR","GBP","AUD","CAD","JPY","AED"
              ].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={exportCSV} className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-3 py-2">
              <Download className="w-4 h-4"/> Export CSV
            </button>
            <button onClick={resetAll} className="inline-flex items-center gap-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800 rounded-xl px-3 py-2">
              <RefreshCcw className="w-4 h-4"/> Reset
            </button>
            {!user ? (
  // show the email/password panel when logged out
            <div className="w-full md:w-auto">
              <AuthPanel />
            </div>
            ) : (
            <button
              onClick={async () => { 
                await supabase.auth.signOut();
                clearAllData(); // belt & suspenders
              }}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-2"
            >
              Sign out ({user?.email})
            </button>

            )}
            {!user && (
              <div className="mt-4 text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                You’re signed out. Sign in to see your transactions.
              </div>
            )}
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
            <p className="text-xs text-slate-400 mt-2">Showing {monthRange.startISO} to {monthRange.endISO}</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <PlusCircle className="w-5 h-5"/>
              <h2 className="font-medium">Add Transaction</h2>
            </div>
            <TxnForm
              categories={categories}
              initial={editing || undefined}
              onSubmit={(t) => user ? upsertTxn(t) : alert("Please sign in to add transactions.")}
              onCancel={() => setEditing(null)}
              currency={currency}
            />

          </div>
        </section>

        {/* Summary Cards */}
        <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2"><DollarSign className="w-5 h-5"/><h3 className="font-medium">This Month</h3></div>
            <div className="text-2xl font-semibold">{formatCurrency(totalMonthSpend, currency)}</div>
            <div className="text-xs text-slate-400">Total spend in {filterMonth}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2"><BarChart3 className="w-5 h-5"/><h3 className="font-medium">Daily Trend</h3></div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySeries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#82ca9d" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263247"/>
                  <XAxis dataKey="date" stroke="#9fb0c3"/>
                  <YAxis stroke="#9fb0c3"/>
                  <RechartsTooltip formatter={(v) => formatCurrency(Number(v), currency)} labelFormatter={(l) => `Day ${l}`}/>
                  <Area type="monotone" dataKey="amount" stroke="#82ca9d" fillOpacity={1} fill="url(#colorSp)"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2"><PieIcon className="w-5 h-5"/><h3 className="font-medium">By Category</h3></div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="amount" nameKey="category" outerRadius={70}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v, n) => [formatCurrency(Number(v), currency), n as string]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* NEW: Loans & Credit Cards */}
        <section className="mt-6 grid grid-cols-1 gap-4">
          {/* Loans */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Landmark className="w-5 h-5"/>
              <h2 className="font-medium">Loans</h2>
            </div>
            <LoanForm onAdd={(loan) => setLoans(prev => [{...loan, id: uid()}, ...prev])} />
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {loans.map(l => (
                <LoanCard
                  key={l.id}
                  loan={l}
                  currency={currency}
                  onPay={(amt, date, note) => payLoan(l.id, amt, date, note)}
                  onDelete={() => setLoans(prev => prev.filter(x => x.id !== l.id))}
                  onEdit={(patch) => setLoans(prev => prev.map(x => x.id === l.id ? { ...x, ...patch } : x))}
                />
              ))}
              {loans.length === 0 && <div className="text-slate-400 text-sm">No loans yet. Add your first loan above.</div>}
            </div>
          </div>

          {/* Cards */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="w-5 h-5"/>
              <h2 className="font-medium">Credit Cards</h2>
            </div>
            <CardForm onAdd={(card) => setCards(prev => [{...card, id: uid()}, ...prev])} />
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {cards.map(c => (
                <CardBox
                  key={c.id}
                  card={c}
                  currency={currency}
                  onPay={(amt, date, note) => payCard(c.id, amt, date, note)}
                  onDelete={() => setCards(prev => prev.filter(x => x.id !== c.id))}
                  onEdit={(patch) => setCards(prev => prev.map(x => x.id === c.id ? { ...x, ...patch } : x))}
                />
              ))}
              {cards.length === 0 && <div className="text-slate-400 text-sm">No credit cards yet. Add one above.</div>}
            </div>
          </div>
        </section>

        {/* Budgets */}
        <section className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-medium mb-3">Budgets (per month)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map(cat => (
              <BudgetRow
                key={cat}
                category={cat}
                value={budgetsByCat.get(cat) || 0}
                spent={budgetUsage.get(cat) || 0}
                onChange={(val) => setBudgets(prev => {
                  const copy = [...prev];
                  const idx = copy.findIndex(b => b.category === cat);
                  if (idx >= 0) copy[idx] = { category: cat, monthlyLimit: val };
                  else copy.push({ category: cat, monthlyLimit: val });
                  return copy;
                })}
                currency={currency}
              />
            ))}
          </div>
        </section>

        {/* Transactions */}
        <section className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium flex items-center gap-2"><BarChart3 className="w-5 h-5"/> Transactions</h2>
            <div className="text-xs text-slate-400">{monthTxns.length} in {filterMonth}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-300">
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Category</th>
                  <th className="text-right p-2">Amount</th>
                  <th className="text-left p-2">Note</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {monthTxns.map(t => (
                  <tr key={t.id} className="border-t border-slate-800">
                    <td className="p-2 whitespace-nowrap">{t.date}</td>
                    <td className="p-2">{t.category}</td>
                    <td className="p-2 text-right">{formatCurrency(t.amount, currency)}</td>
                    <td className="p-2 max-w-[28ch] truncate" title={t.note}>{t.note}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2 justify-center">
                        <button className="hover:text-sky-300" onClick={() => setEditing(t)} title="Edit"><Pencil className="w-4 h-4"/></button>
                        <button className="hover:text-rose-300" onClick={() => removeTxn(t.id)} title="Delete"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {monthTxns.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-slate-400 p-6">No transactions yet for this month.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-400 mt-8">
          Data is stored locally in your browser. For cloud sync + mobile app, we can wire this to Azure later.
        </footer>
      </div>
    </div>
  );
}

// --- Components ---
function TxnForm({ categories, onSubmit, onCancel, initial, currency }:{
  categories: string[];
  onSubmit: (t: Omit<Txn, "id"> & { id?: string }) => void;
  onCancel: () => void;
  initial?: Txn;
  currency: string;
}){
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(initial?.category || categories[0] || "Other");
  const [amount, setAmount] = useState(initial?.amount?.toString() || "");
  const [note, setNote] = useState(initial?.note || "");

  useEffect(()=>{
    if(initial){
      setDate(initial.date);
      setCategory(initial.category);
      setAmount(String(initial.amount));
      setNote(initial.note || "");
    }
  }, [initial?.id]);

  function submit(e: React.FormEvent){
    e.preventDefault();
    const amt = Number(amount);
    if(!amt || amt <= 0) return alert("Please enter a valid amount.");
    onSubmit({ id: initial?.id, date, category: category || "Other", amount: Math.abs(amt), note: note.trim() });
    if(!initial){ setAmount(""); setNote(""); }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-5 gap-2">
      <div>
        <label className="text-xs text-slate-400">Date</label>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">Category</label>
        <select value={category} onChange={e=>setCategory(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-400">Amount ({currency})</label>
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder={`Amount (${currency})`} value={amount} onChange={e=>setAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div className="md:col-span-2">
        <label className="text-xs text-slate-400">Note (optional)</label>
        <input placeholder="Note (optional)" value={note} onChange={e=>setNote(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div className="flex gap-2 col-span-2 md:col-span-1">
        <button className="w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 rounded-xl px-3 py-2"><PlusCircle className="w-4 h-4"/> {initial? "Update" : "Add"}</button>
        {initial && <button type="button" onClick={onCancel} className="w-full inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-2">Cancel</button>}
      </div>
    </form>
  )
}

function BudgetRow({ category, value, onChange, spent, currency }:{
  category: string;
  value: number;
  onChange: (v:number)=>void;
  spent: number;
  currency: string;
}){
  const pct = value > 0 ? Math.min(100, Math.round((spent / value) * 100)) : 0;
  const warn = value > 0 && pct >= 80;
  return (
    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{category}</div>
          <div className="text-xs text-slate-400">Spent {formatCurrency(spent, currency)}{value>0? ` / ${formatCurrency(value, currency)}`: " (no limit)"}</div>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min={0} step="0.01" value={value} onChange={e=>onChange(Number(e.target.value))} className="w-28 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-right"/>
        </div>
      </div>
      <div className="mt-3 h-2 rounded bg-slate-800 overflow-hidden">
        <div className={`${warn? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${pct}%`, height: "100%" }} />
      </div>
      {warn && <div className="text-xs text-rose-300 mt-1">Heads up: {pct}% of budget used</div>}
    </div>
  );
}

// --- NEW: Loans UI ---
function LoanForm({ onAdd }:{ onAdd: (l: Omit<LoanAccount, 'id'>) => void }){
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("0");
  const [dueDay, setDueDay] = useState("1");

  function submit(e: React.FormEvent){
    e.preventDefault();
    const nm = name.trim();
    const p = Math.max(0, Number(principal)||0);
    const b = Math.max(0, Number(balance||principal)||0);
    const a = Math.max(0, Number(apr)||0);
    const d = Math.max(1, Math.min(31, Number(dueDay)||1));
    if(!nm) return alert("Please enter loan name");
    if(b<=0) return alert("Enter a positive balance");
    onAdd({ name: nm, principal: p>0?p:b, balance: b, apr: a, dueDay: d });
    setName(""); setPrincipal(""); setBalance(""); setApr("0"); setDueDay("1");
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-6 gap-2">
      <div className="md:col-span-2">
        <label className="text-xs text-slate-400">Loan name</label>
        <input placeholder="e.g., Car Loan" value={name} onChange={e=>setName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">Principal</label>
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" value={principal} onChange={e=>setPrincipal(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">Current balance</label>
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" value={balance} onChange={e=>setBalance(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">APR %</label>
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0" value={apr} onChange={e=>setApr(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">Due day</label>
        <input type="number" min={1} max={31} placeholder="1-31" value={dueDay} onChange={e=>setDueDay(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div className="md:self-end">
        <button className="w-full bg-sky-600 hover:bg-sky-500 rounded-xl px-3 py-2 inline-flex items-center justify-center gap-2"><PlusCircle className="w-4 h-4"/> Add Loan</button>
      </div>
    </form>
  );
}

function LoanCard({ loan, currency, onPay, onDelete }:{
  loan: LoanAccount;
  currency: string;
  onPay: (amount: number, date: string, note?: string) => void;
  onDelete: () => void;
}){
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const nd = nextDueDate(loan.dueDay);
  const daysLeft = Math.ceil((nd.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  const monthlyInterest = loan.apr > 0 ? (loan.balance * (loan.apr/100) / 12) : 0;
  const dueSoon = daysLeft <= 5;

  return (
    <div className={`p-4 border rounded-2xl ${dueSoon? 'border-amber-500/60 bg-amber-500/5' : 'border-slate-800 bg-slate-950'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center gap-2"><Landmark className="w-4 h-4"/>{loan.name}
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${dueSoon? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>Due {nd.toISOString().slice(0,10)} ({daysLeft}d)</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Balance: {formatCurrency(loan.balance, currency)} • APR {loan.apr || 0}%</div>
          {loan.principal > 0 && <div className="text-xs text-slate-500">Original: {formatCurrency(loan.principal, currency)}</div>}
          {monthlyInterest>0 && <div className="text-xs text-slate-400">Est. monthly interest: ~{formatCurrency(monthlyInterest, currency)}</div>}
        </div>
        <div className="text-right">
          <button onClick={onDelete} className="text-rose-300 hover:text-rose-200 text-xs">Delete</button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="Payment amount" value={amt} onChange={e=>setAmt(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2"/>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2"/>
        <input placeholder="Note (optional)" value={note} onChange={e=>setNote(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 md:col-span-1"/>
        <button onClick={()=>{ const a=Number(amt); if(!a||a<=0) return alert('Enter amount'); onPay(a, date, note); setAmt(''); setNote(''); }} className="bg-emerald-600 hover:bg-emerald-500 rounded-xl px-3 py-2">Make Payment</button>
      </div>
    </div>
  );
}

// --- NEW: Credit Cards UI ---
function CardForm({ onAdd }:{ onAdd: (c: Omit<CreditCardAccount, 'id'>) => void }){
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("0");
  const [stmtDay, setStmtDay] = useState("1");
  const [dueDay, setDueDay] = useState("21");
  const [minPct, setMinPct] = useState("3");

  function submit(e: React.FormEvent){
    e.preventDefault();
    const nm = name.trim();
    const lim = Math.max(0, Number(limit)||0);
    const bal = Math.max(0, Number(balance)||0);
    const a = Math.max(0, Number(apr)||0);
    const sd = Math.max(1, Math.min(31, Number(stmtDay)||1));
    const dd = Math.max(1, Math.min(31, Number(dueDay)||21));
    const mp = Math.max(0, Number(minPct)||3)/100;
    if(!nm) return alert("Enter card name");
    onAdd({ name: nm, limit: lim, balance: bal, apr: a, stmtDay: sd, dueDay: dd, minPct: mp });
    setName(""); setLimit(""); setBalance(""); setApr("0"); setStmtDay("1"); setDueDay("21"); setMinPct("3");
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-7 gap-2">
      <div className="md:col-span-2">
        <label className="text-xs text-slate-400">Card name</label>
        <input placeholder="e.g., HDFC Millennia" value={name} onChange={e=>setName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">Limit</label>
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" value={limit} onChange={e=>setLimit(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">Balance</label>
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" value={balance} onChange={e=>setBalance(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">APR %</label>
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0" value={apr} onChange={e=>setApr(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">Stmt day</label>
        <input type="number" min={1} max={31} placeholder="1-31" value={stmtDay} onChange={e=>setStmtDay(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">Due day</label>
        <input type="number" min={1} max={31} placeholder="1-31" value={dueDay} onChange={e=>setDueDay(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div>
        <label className="text-xs text-slate-400">Min %</label>
        <input type="number" min={0} step="0.1" placeholder="3" value={minPct} onChange={e=>setMinPct(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"/>
      </div>
      <div className="md:self-end">
        <button className="w-full bg-sky-600 hover:bg-sky-500 rounded-xl px-3 py-2 inline-flex items-center justify-center gap-2"><PlusCircle className="w-4 h-4"/> Add Card</button>
      </div>
    </form>
  );
}

function CardBox({ card, currency, onPay, onDelete }:{
  card: CreditCardAccount;
  currency: string;
  onPay: (amount: number, date: string, note?: string) => void;
  onDelete: () => void;
}){
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const due = nextDueDate(card.dueDay);
  const daysLeft = Math.ceil((due.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  const minDue = Math.max(25, Number(((card.minPct || 0.03) * card.balance).toFixed(2))); // floor min 25
  const util = card.limit>0 ? Math.round((card.balance / card.limit) * 100) : 0;
  const riskyUtil = util >= 80;
  const dueSoon = daysLeft <= 5;

  return (
    <div className={`p-4 border rounded-2xl ${dueSoon? 'border-amber-500/60 bg-amber-500/5' : 'border-slate-800 bg-slate-950'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center gap-2"><CreditCard className="w-4 h-4"/>{card.name}
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${dueSoon? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>Due {due.toISOString().slice(0,10)} ({daysLeft}d)</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Balance: {formatCurrency(card.balance, currency)} • Limit {formatCurrency(card.limit, currency)} • Util {util}%</div>
          <div className="text-xs text-slate-400">APR {card.apr || 0}% • Min due ~{formatCurrency(minDue, currency)}</div>
          {riskyUtil && <div className="text-xs text-rose-300 mt-1">High utilization: consider extra payment</div>}
        </div>
        <div className="text-right">
          <button onClick={onDelete} className="text-rose-300 hover:text-rose-200 text-xs">Delete</button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
        <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="Payment amount" value={amt} onChange={e=>setAmt(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2"/>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2"/>
        <input placeholder="Note (optional)" value={note} onChange={e=>setNote(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 md:col-span-1"/>
        <button onClick={()=>{ const a=Number(amt); if(!a||a<=0) return alert('Enter amount'); onPay(a, date, note); setAmt(''); setNote(''); }} className="bg-emerald-600 hover:bg-emerald-500 rounded-xl px-3 py-2">Make Payment</button>
      </div>
    </div>
  );
}
