import React, { useState } from "react";
import { supabase } from "../supabaseClient"; // adjust path if needed

export default function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // handle sign in / sign up
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    try {
      let result;

      if (mode === "signin") {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
      } else {
        result = await supabase.auth.signUp({
          email,
          password,
        });
      }

      if (result.error) {
        alert(result.error.message);
      } else {
        // Redirect after successful sign in
        if (mode === "signin") {
          window.location.replace("/");
        } else {
          alert("Sign up successful! Please check your email to confirm.");
        }
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  // forgot password
  const sendReset = async () => {
    if (!email) {
      alert("Please enter your email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#recovery`,
    });
    if (error) {
      alert(error.message);
    } else {
      alert("Password reset email sent! Please check your inbox.");
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
        className="bg-emerald-600 hover:bg-emerald-500 rounded-xl px-3 py-2"
      >
        {busy
          ? "Please wait…"
          : mode === "signup"
          ? "Create account"
          : "Sign in"}
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
