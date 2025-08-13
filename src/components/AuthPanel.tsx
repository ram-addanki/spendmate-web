import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // on success, App's auth listener will set user state
      }
    } catch (err: any) {
      alert(err.message || "Auth error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <div className="flex gap-2 text-sm">
        <button type="button" className={mode==="signin" ? "underline" : ""} onClick={()=>setMode("signin")}>Sign in</button>
        <span>·</span>
        <button type="button" className={mode==="signup" ? "underline" : ""} onClick={()=>setMode("signup")}>Sign up</button>
      </div>
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={e=>setEmail(e.target.value)}
        required
        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e=>setPassword(e.target.value)}
        required
        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
      />
      <button disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 rounded-xl px-3 py-2">
        {busy ? "Please wait…" : (mode === "signup" ? "Create account" : "Sign in")}
      </button>
    </form>
  );
}
