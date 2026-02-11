import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench, Loader2, ArrowLeft, Mail, KeyRound } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "verify">("email");
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary mb-4">
            <Wrench className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-login-title">AiPM Tool Belt</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in with your company email</p>
        </div>

        <Card className="p-6">
          {step === "email" ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                    autoFocus
                    data-testid="input-email"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive" data-testid="text-error">{error}</p>
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

              <p className="text-xs text-center text-muted-foreground">
                Only authorized company emails are accepted.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm text-muted-foreground">
                  Code sent to <span className="font-medium text-foreground">{sentEmail}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="pl-9 text-center font-mono text-lg tracking-widest"
                    required
                    autoFocus
                    data-testid="input-code"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive" data-testid="text-verify-error">{error}</p>
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

              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
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
  );
}
