import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users, authTokens, DEFAULT_ROLE_FEATURES, userFeatureAccess } from "@shared/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { createHash, randomInt } from "crypto";
import { sendOTPEmail } from "./emailService";
import { auditLog } from "./auditService";
import { storage } from "./storage";

const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || "nationalbuildingspecialties.com,swinerton.com")
  .split(",")
  .map(d => d.trim().toLowerCase());

const OTP_EXPIRY_MINUTES = 10;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function hashOTP(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateOTP(): string {
  return String(randomInt(100000, 999999));
}

export function isAllowedDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}

function getClientIP(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

export const QUICK_LOGIN_USERS: Record<string, {
  email: string;
  role: "admin" | "user";
  initials: string;
  displayName: string;
  dashboardScope?: string;
  dashboardLayout?: string;
}> = {
  hk: { email: "Haley.Kruse@nationalbuildingspecialties.com", role: "admin", initials: "HK", displayName: "Haley Kruse", dashboardScope: "my_projects", dashboardLayout: "estimator" },
  gm: { email: "Gonzalo.Martinez@nationalbuildingspecialties.com", role: "user", initials: "GM", displayName: "Gonzalo Martinez", dashboardScope: "my_projects", dashboardLayout: "estimator" },
  gt: { email: "Gene.Trabert@nationalbuildingspecialties.com", role: "user", initials: "GT", displayName: "Gene Trabert", dashboardScope: "my_projects", dashboardLayout: "estimator" },
  kr: { email: "Kenny.Ruester@nationalbuildingspecialties.com", role: "user", initials: "KR", displayName: "Kenny Ruester", dashboardScope: "my_projects", dashboardLayout: "estimator" },
  ck: { email: "Christina.Keith@nationalbuildingspecialties.com", role: "user", initials: "CK", displayName: "Christina Keith", dashboardScope: "my_projects", dashboardLayout: "estimator" },
  hc: { email: "Hallyn.Crozier@nationalbuildingspecialties.com", role: "user", initials: "HC", displayName: "Hallyn Crozier", dashboardScope: "my_projects", dashboardLayout: "estimator" },
  mm: { email: "Melissa.Magallanes@nationalbuildingspecialties.com", role: "user", initials: "MM", displayName: "Melissa Magallanes", dashboardScope: "my_projects", dashboardLayout: "estimator" },
  jw: { email: "Joey.White@nationalbuildingspecialties.com", role: "user", initials: "JW", displayName: "Joey White", dashboardScope: "my_projects", dashboardLayout: "estimator" },
};

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/quick-login", async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      if (!username || typeof username !== "string") {
        return res.status(400).json({ message: "Username is required" });
      }

      const key = username.trim().toLowerCase();
      const shortcut = QUICK_LOGIN_USERS[key];
      if (!shortcut) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const { email: mappedEmail, role: targetRole, initials: targetInitials, displayName: targetDisplayName, dashboardScope: targetScope, dashboardLayout: targetLayout } = shortcut;

      let [user] = await db.select().from(users).where(eq(users.email, mappedEmail));
      if (!user) {
        [user] = await db.insert(users).values({
          email: mappedEmail,
          username: key,
          role: targetRole,
          initials: targetInitials,
          displayName: targetDisplayName,
          dashboardScope: targetScope || "my_projects",
          dashboardLayout: targetLayout || "estimator",
          isActive: true,
        }).returning();
      } else {
        const updates: Record<string, any> = {};
        if (user.role !== targetRole) updates.role = targetRole;
        if (user.initials !== targetInitials) updates.initials = targetInitials;
        if (user.displayName !== targetDisplayName) updates.displayName = targetDisplayName;
        if (!user.dashboardScope && targetScope) updates.dashboardScope = targetScope;
        if (!user.dashboardLayout && targetLayout) updates.dashboardLayout = targetLayout;
        if (Object.keys(updates).length > 0) {
          await db.update(users).set(updates).where(eq(users.id, user.id));
          user = { ...user, ...updates };
        }
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Account is deactivated" });
      }

      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      (req.session as any).userId = user.id;

      const ip = getClientIP(req);
      await auditLog({
        actionType: targetRole === "admin" ? "admin_quick_login" : "user_quick_login",
        actorUserId: user.id,
        actorEmail: user.email,
        summary: `Quick login (${targetRole}) via username: ${key}`,
        ipAddress: ip,
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json({
        user: { id: user.id, email: user.email, role: user.role, initials: user.initials, displayName: user.displayName, username: user.username, dashboardScope: user.dashboardScope, dashboardLayout: user.dashboardLayout, assignedRegion: user.assignedRegion },
      });
    } catch (error: any) {
      console.error("[Auth] Quick login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/request", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const ip = getClientIP(req);

      if (!checkRateLimit(`ip:${ip}`) || !checkRateLimit(`email:${normalizedEmail}`)) {
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }

      if (!isAllowedDomain(normalizedEmail)) {
        await auditLog({
          actionType: "login_failed_domain",
          actorEmail: normalizedEmail,
          summary: `Login attempt blocked: unauthorized domain`,
          ipAddress: ip,
          userAgent: req.headers["user-agent"] || "",
          requestPath: req.path,
          requestMethod: req.method,
        });
        return res.status(403).json({ message: "This email domain is not authorized. Only company email addresses are allowed." });
      }

      let [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
      if (!user) {
        [user] = await db.insert(users).values({ email: normalizedEmail }).returning();
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Your account has been deactivated. Please contact an administrator." });
      }

      const code = generateOTP();
      const hash = hashOTP(code);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await db.insert(authTokens).values({
        userId: user.id,
        tokenHash: hash,
        expiresAt,
        type: "otp",
      });

      await sendOTPEmail(normalizedEmail, code);

      res.json({ message: "Verification code sent to your email", email: normalizedEmail });
    } catch (error: any) {
      console.error("[Auth] Request OTP error:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  app.post("/api/auth/verify", async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email and code are required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const ip = getClientIP(req);
      const hash = hashOTP(code);

      const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
      if (!user) {
        return res.status(401).json({ message: "Invalid email or code" });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Your account has been deactivated." });
      }

      const [token] = await db
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.userId, user.id),
            eq(authTokens.tokenHash, hash),
            gt(authTokens.expiresAt, new Date()),
            isNull(authTokens.usedAt)
          )
        );

      if (!token) {
        return res.status(401).json({ message: "Invalid or expired code. Please request a new one." });
      }

      await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, token.id));
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

      // Initialize default permissions if user has none
      const existingPermissions = await storage.getUserFeatureAccess(user.id);
      if (existingPermissions.length === 0) {
        const defaultFeatures = DEFAULT_ROLE_FEATURES[user.role] || DEFAULT_ROLE_FEATURES.user;
        if (defaultFeatures.length > 0) {
          await db.insert(userFeatureAccess).values(
            defaultFeatures.map((feature) => ({ userId: user.id, feature }))
          );
        }
      }

      (req.session as any).userId = user.id;

      await auditLog({
        actionType: "login_success",
        actorUserId: user.id,
        actorEmail: user.email,
        summary: `User logged in`,
        ipAddress: ip,
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json({
        user: { id: user.id, email: user.email, role: user.role, initials: user.initials, displayName: user.displayName, username: user.username, dashboardScope: user.dashboardScope, dashboardLayout: user.dashboardLayout, assignedRegion: user.assignedRegion },
      });
    } catch (error: any) {
      console.error("[Auth] Verify error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.isActive) {
        (req.session as any).userId = null;
        return res.status(401).json({ message: "Not authenticated" });
      }

      res.json({ user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName, initials: user.initials, username: user.username, dashboardScope: user.dashboardScope, dashboardLayout: user.dashboardLayout, assignedRegion: user.assignedRegion } });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user info" });
    }
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (userId) {
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        await auditLog({
          actionType: "logout",
          actorUserId: userId,
          actorEmail: user?.email,
          summary: "User logged out",
          ipAddress: getClientIP(req),
          userAgent: req.headers["user-agent"] || "",
          requestPath: req.path,
          requestMethod: req.method,
        });
      }

      req.session.destroy((err) => {
        if (err) console.error("[Auth] Session destroy error:", err);
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out" });
      });
    } catch (error) {
      res.status(500).json({ message: "Logout failed" });
    }
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Account is deactivated" });
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Account is deactivated" });
  }
  if (user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}
