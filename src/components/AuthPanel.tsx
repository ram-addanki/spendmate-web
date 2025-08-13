import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient"; // adjust if your path differs

export default function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Sign in / Sign up
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password;

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPass,
        });
        if (error) throw error;

        // go to home (your App listens for auth changes anyway)
        window.location.replace("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPass,
        });
        if (error) throw error;
        alert("Sign up successful! Please check your email to confirm.");
        setMode("signin");
      }
    } catch (err: any) {
      alert(err?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  // Forgot password
  const sendReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      alert("Enter your email first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      // Supabase will append the recovery tokens in the hash automatically
      redirectTo: window.location.origin,
    });
    if (error) {
      alert(error.message);
    } else {
      alert("Password reset email sent! Check your inbox.");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-4"
    >
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          className={mode === "signin" ? "underline" : ""}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <span>·</span>
        <button
          type="button"
          className={mode === "signup" ? "underline" : ""}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
      />

      <button
        disabled={busy}
        className="bg-emerald-600 hover:bg-emerald-500 rounded-xl px-3 py-2 disabled:opacity-60"
      >
        {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      <button
        type="button"
        onClick={sendReset}
        className="text-sm text-sky-300 hover:underline justify-self-start"
      >
        Forgot password?
      </button>
    </form>
  );
}
