import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Loader2, KeyRound, LogOut } from "lucide-react";

export default function ForcePasswordChangePage() {
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next === current) { setError("New password must be different from temporary password."); return; }
    if (next !== confirm) { setError("Passwords do not match."); return; }
    mutation.mutate();
  };

  const inputCls = "w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-yellow-500/40";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border p-8 shadow-xl" style={{ background: "var(--card-bg, rgba(14,17,24,0.95))", borderColor: "rgba(200,164,78,0.2)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "rgba(200,164,78,0.15)" }}>
            <KeyRound className="h-5 w-5" style={{ color: "var(--gold, #C8A44E)" }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Set a new password</h1>
            <p className="text-xs text-muted-foreground">Required before you can continue</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Hi {user?.displayName || user?.email}, your account is using a temporary password set by an administrator.
          Please choose a new password to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Temporary Password</label>
            <input type="password" className={inputCls} value={current} onChange={e => setCurrent(e.target.value)} required autoFocus autoComplete="current-password" data-testid="input-temp-password" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">New Password</label>
            <input type="password" className={inputCls} value={next} onChange={e => setNext(e.target.value)} placeholder="At least 8 characters" required autoComplete="new-password" data-testid="input-new-password" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Confirm New Password</label>
            <input type="password" className={inputCls} value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" data-testid="input-confirm-password" />
          </div>
          {error && <p className="text-xs text-destructive" data-testid="text-force-pw-error">{error}</p>}
          <button
            type="submit"
            disabled={mutation.isPending || !current || !next || !confirm}
            className="w-full rounded-md py-2.5 text-sm font-semibold transition disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #C8A44E, #A8843E)", color: "#0A0C10" }}
            data-testid="button-set-new-password"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Set New Password"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => logout()}
          className="w-full mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
          data-testid="button-logout-from-force"
        >
          <LogOut className="h-3 w-3" /> Sign out
        </button>
      </div>
    </div>
  );
}
