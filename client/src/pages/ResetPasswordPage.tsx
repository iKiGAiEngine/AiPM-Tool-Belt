import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";

export default function ResetPasswordPage() {
  const [location, navigate] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") || "";
    setToken(t);
    if (!t) setError("No reset token found. Please request a new link.");
  }, [location]);

  useEffect(() => {
    if (!done) return;
    const interval = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) {
          clearInterval(interval);
          navigate("/");
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [done, navigate]);

  const mutation = useMutation({
    mutationFn: async ({ token, password }: { token: string; password: string }) => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      setDone(true);
      setError("");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirm) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    mutation.mutate({ token, password });
  };

  const inputStyles: React.CSSProperties = {
    width: "100%",
    padding: "0.7rem 0.85rem",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    color: "#F0F0F2",
    fontSize: "0.88rem",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  const goldBtnStyles: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem",
    background: "linear-gradient(135deg, #C8A44E, #A8843E)",
    border: "1px solid rgba(201,168,76,0.3)",
    borderRadius: "10px",
    color: "#0A0C10",
    fontSize: "0.88rem",
    fontWeight: 700,
    fontFamily: "'Rajdhani', sans-serif",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    cursor: "pointer",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        .rp-input:focus { border-color: #C8A44E !important; box-shadow: 0 0 0 3px rgba(200,164,78,0.1) !important; }
        .rp-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .rp-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; filter: none; }
        .rp-link { color: #8A8F9E; font-size: 0.82rem; text-decoration: none; transition: color 0.2s; }
        .rp-link:hover { color: #C8A44E; }
        .rp-spinner {
          width: 16px; height: 16px;
          border: 2.5px solid rgba(10,12,16,0.3);
          border-top-color: #0A0C10;
          border-radius: 50%;
          animation: rp-spin 0.6s linear infinite;
        }
        @keyframes rp-spin { to { transform: rotate(360deg); } }
        @keyframes rp-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .rp-animate { animation: rp-fade 0.35s ease-out; }
        .pw-tog {
          position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #5C6170; padding: 0.2rem;
          transition: color 0.2s;
        }
        .pw-tog:hover { color: #C8A44E; }
      `}</style>
      <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "#0C0E14" }}>
        <div
          className="rp-animate"
          style={{
            width: "100%",
            maxWidth: "400px",
            background: "rgba(14,17,24,0.95)",
            border: "1px solid rgba(200,164,78,0.12)",
            borderRadius: "20px",
            padding: "2.25rem 2rem 1.75rem",
            boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            <div style={{
              width: "44px", height: "44px",
              clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
              background: "linear-gradient(135deg, #C8A44E, #A8843E)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 1rem",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0A0C10" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "1.5rem", fontWeight: 700 }}>
              <span style={{ background: "linear-gradient(135deg, #D4B86A, #C8A44E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>AiPM</span>
              <span style={{ color: "#F0F0F2" }}> Tool Belt</span>
            </span>
          </div>

          {done ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "rgba(200,164,78,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C8A44E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "#F0F0F2", margin: "0 0 0.5rem" }}>Password set!</h2>
              <p style={{ color: "#8A8F9E", fontSize: "0.85rem", marginBottom: "0.75rem" }}>Your password has been saved.</p>
              <p style={{ color: "#5C6170", fontSize: "0.8rem", marginBottom: "1.25rem" }}>Redirecting to sign in in {countdown}…</p>
              <Link href="/" className="rp-link" data-testid="link-go-to-login">Sign in now &#8594;</Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "1.5rem", fontWeight: 700, color: "#F0F0F2", margin: "0 0 0.3rem", textAlign: "center" }}>Set your password</h2>
              <p style={{ color: "#8A8F9E", fontSize: "0.85rem", margin: "0 0 1.5rem", textAlign: "center" }}>Choose a strong password for your account.</p>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "#8A8F9E", marginBottom: "0.4rem" }}>New Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      className="rp-input"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ ...inputStyles, paddingRight: "2.5rem" }}
                      required
                      autoFocus
                      autoComplete="new-password"
                      data-testid="input-password"
                    />
                    <button type="button" className="pw-tog" onClick={() => setShowPassword(p => !p)} aria-label="Toggle password">
                      {showPassword ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "#8A8F9E", marginBottom: "0.4rem" }}>Confirm Password</label>
                  <input
                    className="rp-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repeat your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    style={inputStyles}
                    required
                    autoComplete="new-password"
                    data-testid="input-confirm-password"
                  />
                </div>

                {error && (
                  <p style={{ color: "#ef4444", fontSize: "0.82rem", marginBottom: "0.75rem" }} data-testid="text-error">{error}</p>
                )}

                <button
                  className="rp-btn"
                  type="submit"
                  disabled={mutation.isPending || !token || !password || !confirm}
                  style={goldBtnStyles}
                  data-testid="button-set-password"
                >
                  {mutation.isPending ? <div className="rp-spinner"></div> : "Set Password"}
                </button>
              </form>

              {!error.includes("No reset token") && (
                <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
                  <Link href="/forgot-password" className="rp-link" data-testid="link-request-new">Need a new link?</Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
