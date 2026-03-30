import { db } from "../db";
import { apsTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const TOKEN_BUFFER_MS = 5 * 60 * 1000;

const INVALID_GRANT_ERRORS = ["invalid_grant", "invalid_token"];

const refreshLocks = new Map<number, Promise<string | null>>();

export async function getValidToken(userId: number): Promise<string | null> {
  const [token] = await db
    .select()
    .from(apsTokens)
    .where(eq(apsTokens.userId, userId));

  if (!token) return null;

  const now = new Date();
  const expiresAt = new Date(token.expiresAt);

  if (expiresAt.getTime() - TOKEN_BUFFER_MS > now.getTime()) {
    return token.accessToken;
  }

  const existing = refreshLocks.get(userId);
  if (existing) return existing;

  const refreshPromise = refreshToken(token.id, token.refreshToken);
  refreshLocks.set(userId, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    refreshLocks.delete(userId);
  }
}

async function refreshToken(tokenId: number, refreshTokenValue: string): Promise<string | null> {
  const clientId = process.env.APS_CLIENT_ID;
  const clientSecret = process.env.APS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[APS] Missing APS_CLIENT_ID or APS_CLIENT_SECRET");
    return null;
  }

  try {
    const res = await fetch(APS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshTokenValue,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[APS] Token refresh failed:", res.status, errText);

      let errBody: { error?: string } = {};
      try { errBody = JSON.parse(errText); } catch {}

      if (errBody.error && INVALID_GRANT_ERRORS.includes(errBody.error)) {
        await db.delete(apsTokens).where(eq(apsTokens.id, tokenId));
        console.warn("[APS] Refresh token permanently invalid, removed stored token");
      }

      return null;
    }

    const data = await res.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
    };

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await db
      .update(apsTokens)
      .set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        scope: data.scope || null,
        updatedAt: new Date(),
      })
      .where(eq(apsTokens.id, tokenId));

    return data.access_token;
  } catch (err) {
    console.error("[APS] Token refresh error:", err);
    return null;
  }
}

export async function hasValidConnection(userId: number): Promise<boolean> {
  const [token] = await db
    .select()
    .from(apsTokens)
    .where(eq(apsTokens.userId, userId));

  if (!token) return false;

  const expiresAt = new Date(token.expiresAt);
  return expiresAt.getTime() > Date.now();
}
