import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = { onClose: () => void };

function ResetPasswordModal({ onClose }: Props) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (p1.length < 8) return alert("Password must be at least 8 characters.");
    if (p1 !== p2) return alert("Passwords do not match.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setLoading(false);

    if (error) return alert(error.message);
    alert("Password updated! You're signed in now.");
    window.location.hash = ""; // clean up URL
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={submit}
        className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-[90%] max-w-sm"
      >
        <h3 className="text-lg font-semibold mb-3">Set a new password</h3>
        <div className="space-y-2">
          <input
            type="password"
            placeholder="New password"
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-xl px-3 py-2"
          >
            {loading ? "Saving..." : "Save password"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default ResetPasswordModal;
