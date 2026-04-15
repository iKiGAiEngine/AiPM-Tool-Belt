import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      setSent(true);
      setError("");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    mutation.mutate(email.trim());
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
        .fp-input:focus {
          border-color: #C8A44E !important;
          box-shadow: 0 0 0 3px rgba(200,164,78,0.1) !important;
        }
        .fp-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .fp-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; filter: none; }
        .fp-link { color: #8A8F9E; font-size: 0.82rem; text-decoration: none; transition: color 0.2s; }
        .fp-link:hover { color: #C8A44E; }
        .fp-spinner {
          width: 16px; height: 16px;
          border: 2.5px solid rgba(10,12,16,0.3);
          border-top-color: #0A0C10;
          border-radius: 50%;
          animation: fp-spin 0.6s linear infinite;
        }
        @keyframes fp-spin { to { transform: rotate(360deg); } }
        @keyframes fp-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fp-animate { animation: fp-fade 0.35s ease-out; }
      `}</style>
      <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "#0C0E14" }}>
        <div
          className="fp-animate"
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

          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "rgba(200,164,78,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C8A44E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "#F0F0F2", margin: "0 0 0.5rem" }}>Check your email</h2>
              <p style={{ color: "#8A8F9E", fontSize: "0.85rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
                If that address is registered, you'll receive a password reset link shortly. The link expires in 1 hour.
              </p>
              <Link href="/" className="fp-link" data-testid="link-back-to-login">&#8592; Back to sign in</Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "1.5rem", fontWeight: 700, color: "#F0F0F2", margin: "0 0 0.3rem", textAlign: "center" }}>Reset password</h2>
              <p style={{ color: "#8A8F9E", fontSize: "0.85rem", margin: "0 0 1.5rem", textAlign: "center" }}>Enter your email and we'll send you a reset link.</p>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "#8A8F9E", marginBottom: "0.4rem" }}>Email</label>
                  <input
                    className="fp-input"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyles}
                    required
                    autoFocus
                    data-testid="input-email"
                  />
                </div>

                {error && (
                  <p style={{ color: "#ef4444", fontSize: "0.82rem", marginBottom: "0.75rem" }} data-testid="text-error">{error}</p>
                )}

                <button
                  className="fp-btn"
                  type="submit"
                  disabled={mutation.isPending || !email.trim()}
                  style={goldBtnStyles}
                  data-testid="button-send-reset"
                >
                  {mutation.isPending ? <div className="fp-spinner"></div> : "Send Reset Link"}
                </button>
              </form>

              <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
                <Link href="/" className="fp-link" data-testid="link-back-to-login">&#8592; Back to sign in</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
