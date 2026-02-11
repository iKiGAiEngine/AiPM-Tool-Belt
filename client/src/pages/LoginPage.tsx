import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Mail, KeyRound, User } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

function FloatingParticles() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 8,
    duration: Math.random() * 6 + 8,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-primary/20"
          style={{
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animation: `float-particle ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [step, setStep] = useState<"choose" | "email" | "verify" | "quick">("choose");
  const [sentEmail, setSentEmail] = useState("");
  const [error, setError] = useState("");

  const requestMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      return data;
    },
    onSuccess: (data) => {
      setSentEmail(data.email);
      setStep("verify");
      setError("");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const quickLoginMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await fetch("/api/auth/quick-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleRequestCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    requestMutation.mutate(email.trim());
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    verifyMutation.mutate({ email: sentEmail, code: code.trim() });
  };

  const handleQuickLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    quickLoginMutation.mutate(username.trim());
  };

  return (
    <div className="min-h-screen animate-gradient-bg relative flex items-center justify-center p-4">
      <FloatingParticles />

      <div className="w-full max-w-sm relative z-10">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-center mb-2 animate-brand-reveal" data-testid="text-login-title">
            <span className="text-primary">AiPM Tool Belt</span>
          </h1>
          <h2 className="text-lg sm:text-xl font-semibold tracking-wide text-gray-400 text-center mb-3 animate-subtitle-slide">
            Your AI Assisted Digital PM
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs animate-subtitle-slide" style={{ animationDelay: "0.15s" }}>
            Transform your estimating workflow with intelligent automation.
          </p>
        </div>

        <div className="animate-fade-in-scale" style={{ animationDelay: "0.2s" }}>
          <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
            {step === "choose" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    className="w-full"
                    onClick={() => { setStep("quick"); setError(""); }}
                    data-testid="button-choose-quick"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Admin Login
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => { setStep("quick"); setError(""); }}
                    data-testid="button-choose-user"
                  >
                    <User className="h-4 w-4 mr-2" />
                    User Login
                  </Button>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-transparent px-2 text-gray-500">or</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-white/15 text-white"
                  onClick={() => { setStep("email"); setError(""); }}
                  data-testid="button-choose-email"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Sign in with Email Code
                </Button>
              </div>
            )}

            {step === "quick" && (
              <form onSubmit={handleQuickLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-gray-300">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary/50 focus:ring-primary/20"
                      required
                      autoFocus
                      data-testid="input-username"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-400" data-testid="text-error">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={quickLoginMutation.isPending || !username.trim()}
                  data-testid="button-quick-login"
                >
                  {quickLoginMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-gray-400"
                  onClick={() => { setStep("choose"); setError(""); setUsername(""); }}
                  data-testid="button-back-choose"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  Back
                </Button>
              </form>
            )}

            {step === "email" && (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary/50 focus:ring-primary/20"
                      required
                      autoFocus
                      data-testid="input-email"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-400" data-testid="text-error">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={requestMutation.isPending || !email.trim()}
                  data-testid="button-request-code"
                >
                  {requestMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Verification Code"
                  )}
                </Button>

                <p className="text-xs text-center text-gray-500">
                  Only authorized company emails are accepted.
                </p>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-gray-400"
                  onClick={() => { setStep("choose"); setError(""); setEmail(""); }}
                  data-testid="button-back-choose-2"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  Back
                </Button>
              </form>
            )}

            {step === "verify" && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="text-center mb-2">
                  <p className="text-sm text-gray-400">
                    Code sent to <span className="font-medium text-white">{sentEmail}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="code" className="text-gray-300">Verification Code</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      className="pl-9 text-center font-mono text-lg tracking-widest bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary/50 focus:ring-primary/20"
                      required
                      autoFocus
                      data-testid="input-code"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-400" data-testid="text-verify-error">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={verifyMutation.isPending || code.length < 6}
                  data-testid="button-verify-code"
                >
                  {verifyMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify & Sign In"
                  )}
                </Button>

                <div className="flex justify-between gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-gray-400"
                    onClick={() => {
                      setStep("email");
                      setCode("");
                      setError("");
                    }}
                    data-testid="button-back-to-email"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                    Different email
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-gray-400"
                    onClick={() => {
                      setError("");
                      requestMutation.mutate(sentEmail);
                    }}
                    disabled={requestMutation.isPending}
                    data-testid="button-resend-code"
                  >
                    Resend code
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
