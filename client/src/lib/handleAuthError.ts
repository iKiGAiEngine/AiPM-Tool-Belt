import { queryClient } from "./queryClient";
import { toast } from "@/hooks/use-toast";

let alreadyHandling = false;

/**
 * Returns true if the given error/response indicates an expired or missing session.
 * Recognizes:
 *   - thrown Error messages that start with "401:" (from getQueryFn / apiRequest)
 *   - explicit "Session expired" / "Authentication required" messages
 */
export function isAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
      ? err
      : "";
  return /^401[:\s]|Session expired|Authentication required/i.test(msg);
}

/**
 * Centralized handler for an expired/invalid session.
 * - Toasts the user once
 * - Clears all query cache so stale data doesn't flash
 * - Invalidates the auth query so AuthProvider re-renders into the LoginPage
 *
 * The app does not have a /login route — when `useAuth().user` becomes null,
 * App.tsx automatically renders <LoginPage />. So invalidating /api/auth/me
 * is the equivalent of "redirect to login".
 */
export function handleAuthError(): void {
  if (alreadyHandling) return;
  alreadyHandling = true;

  toast({
    title: "Session expired",
    description: "Please log in again to continue.",
    variant: "destructive",
  });

  // Clear stale data so no broken content flashes
  queryClient.clear();

  // Trigger AuthProvider re-fetch -> user becomes null -> LoginPage renders
  queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

  // Allow re-handling later (after login)
  setTimeout(() => {
    alreadyHandling = false;
  }, 5000);
}

/**
 * Convenience helper: if the error looks like a 401, handle it and return true.
 * Use in catch blocks of one-off fetches:
 *   try { ... } catch (e) { if (handleIfAuthError(e)) return; ... }
 */
export function handleIfAuthError(err: unknown): boolean {
  if (isAuthError(err)) {
    handleAuthError();
    return true;
  }
  return false;
}
