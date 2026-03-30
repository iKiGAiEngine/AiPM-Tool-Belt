import type { Express, Request, Response } from "express";
import { db } from "../db";
import { apsTokens } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../authRoutes";
import { hasValidConnection } from "./tokenManager";
import { randomBytes } from "crypto";

const APS_AUTH_BASE = "https://developer.api.autodesk.com/authentication/v2";
const APS_TOKEN_URL = `${APS_AUTH_BASE}/token`;
const STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthPending {
  userId: number;
  createdAt: number;
}

const pendingStates = new Map<string, OAuthPending>();

function cleanExpiredStates() {
  const now = Date.now();
  for (const [nonce, pending] of pendingStates) {
    if (now - pending.createdAt > STATE_TTL_MS) {
      pendingStates.delete(nonce);
    }
  }
}

function getRedirectUri(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS || "";
  return `https://${domain}/auth/autodesk/callback`;
}

export function registerAutodeskRoutes(app: Express) {
  app.get("/api/autodesk/login", requireAuth, (req: Request, res: Response) => {
    const clientId = process.env.APS_CLIENT_ID;
    if (!clientId) {
      return res.redirect("/project-log?bc=error");
    }

    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.redirect("/project-log?bc=error");
    }

    cleanExpiredStates();

    const nonce = randomBytes(32).toString("hex");
    pendingStates.set(nonce, { userId, createdAt: Date.now() });

    const redirectUri = getRedirectUri();
    const scope = "data:read";

    const authUrl = new URL(`${APS_AUTH_BASE}/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("state", nonce);

    res.redirect(authUrl.toString());
  });

  app.get("/auth/autodesk/callback", async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        console.error("[APS] OAuth error:", error);
        return res.redirect("/project-log?bc=error");
      }

      if (!code || !state) {
        return res.redirect("/project-log?bc=error");
      }

      const nonce = state as string;
      const pending = pendingStates.get(nonce);

      if (!pending) {
        console.error("[APS] Invalid or expired OAuth state");
        return res.redirect("/project-log?bc=error");
      }

      if (Date.now() - pending.createdAt > STATE_TTL_MS) {
        pendingStates.delete(nonce);
        console.error("[APS] OAuth state expired");
        return res.redirect("/project-log?bc=error");
      }

      pendingStates.delete(nonce);
      const userId = pending.userId;

      const clientId = process.env.APS_CLIENT_ID;
      const clientSecret = process.env.APS_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        console.error("[APS] Missing client credentials");
        return res.redirect("/project-log?bc=error");
      }

      const redirectUri = getRedirectUri();

      const tokenRes = await fetch(APS_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("[APS] Token exchange failed:", tokenRes.status, errText);
        return res.redirect("/project-log?bc=error");
      }

      const data = await tokenRes.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        scope?: string;
      };

      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      const [existing] = await db
        .select()
        .from(apsTokens)
        .where(eq(apsTokens.userId, userId));

      if (existing) {
        await db
          .update(apsTokens)
          .set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt,
            scope: data.scope || null,
            updatedAt: new Date(),
          })
          .where(eq(apsTokens.id, existing.id));
      } else {
        await db.insert(apsTokens).values({
          userId,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt,
          scope: data.scope || null,
        });
      }

      console.log(`[APS] User ${userId} connected to BuildingConnected`);
      res.redirect("/project-log?bc=connected");
    } catch (err) {
      console.error("[APS] Callback error:", err);
      res.redirect("/project-log?bc=error");
    }
  });

  app.get("/api/autodesk/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.json({ connected: false });
      }

      const connected = await hasValidConnection(userId);
      res.json({ connected });
    } catch (err) {
      console.error("[APS] Status check error:", err);
      res.json({ connected: false });
    }
  });

  app.post("/api/autodesk/disconnect", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      await db.delete(apsTokens).where(eq(apsTokens.userId, userId));
      res.json({ success: true });
    } catch (err) {
      console.error("[APS] Disconnect error:", err);
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });
}
