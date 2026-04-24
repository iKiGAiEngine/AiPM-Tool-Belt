import type { Express, Request, Response } from "express";
import { z } from "zod";
import { captureError } from "./errorCapture";

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_PER_WINDOW = 50;
const rateMap = new Map<string, { count: number; resetAt: number }>();

function rateLimitOk(key: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_PER_WINDOW) return false;
  entry.count++;
  return true;
}

function clientKey(req: Request): string {
  const userId = (req.session as any)?.userId;
  if (userId) return `u:${userId}`;
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  return `ip:${ip}`;
}

const metadataSchema = z
  .record(z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
  .refine((obj) => Object.keys(obj).length <= 20, {
    message: "metadata must have at most 20 keys",
  });

const frontendErrorSchema = z.object({
  errorType: z.enum(["react_render", "window_error", "unhandled_rejection", "manual"]),
  message: z.string().min(1).max(4000),
  stack: z.string().max(16000).optional().nullable(),
  pageUrl: z.string().max(1000).optional().nullable(),
  componentStack: z.string().max(16000).optional().nullable(),
  metadata: metadataSchema.optional().nullable(),
});

export function registerErrorRoutes(app: Express) {
  app.post("/api/errors/frontend", async (req: Request, res: Response) => {
    try {
      if (!rateLimitOk(clientKey(req))) {
        return res.status(429).json({ ok: false, error: "rate limited" });
      }

      const parsed = frontendErrorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "invalid payload" });
      }

      const { errorType, message, stack, pageUrl, componentStack, metadata } = parsed.data;
      const userId = (req.session as any)?.userId ?? null;
      const userAgent = (req.get("user-agent") ?? "").slice(0, 500);

      await captureError({
        errorType,
        errorMessage: message,
        stackTrace: stack ?? null,
        endpoint: null,
        userId,
        pageUrl: pageUrl ?? null,
        metadata: {
          ...(metadata ?? {}),
          ...(componentStack ? { componentStack: componentStack.slice(0, 16000) } : {}),
          ...(userAgent ? { userAgent } : {}),
          source: "frontend",
        },
      });

      res.status(204).end();
    } catch (err: any) {
      console.error("[errorRoutes] /api/errors/frontend failed:", err?.message ?? err);
      res.status(204).end();
    }
  });
}
