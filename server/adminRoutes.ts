import type { Express, Request, Response } from "express";
import { db } from "./db";
import { users, auditLogs, FEATURES, DEFAULT_ROLE_FEATURES, Feature, permissionProfiles } from "@shared/schema";
import { eq, desc, and, gte, lte, like, or, sql } from "drizzle-orm";
import { requireAdmin, isAllowedDomain } from "./authRoutes";
import { auditLog } from "./auditService";
import { storage } from "./storage";

export function registerAdminRoutes(app: Express) {
  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      res.json(allUsers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/toggle-active", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const actorId = (req.session as any)?.userId;

      if (actorId === userId) {
        return res.status(400).json({ message: "You cannot deactivate your own account" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      const [updated] = await db
        .update(users)
        .set({ isActive: !user.isActive })
        .where(eq(users.id, userId))
        .returning();

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: updated.isActive ? "user_activated" : "user_deactivated",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "user",
        entityId: String(userId),
        summary: `${updated.isActive ? "Activated" : "Deactivated"} user ${updated.email}`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { role } = req.body;
      const actorId = (req.session as any)?.userId;

      if (!["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      if (actorId === userId && role !== "admin") {
        return res.status(400).json({ message: "You cannot demote yourself" });
      }

      const [updated] = await db
        .update(users)
        .set({ role })
        .where(eq(users.id, userId))
        .returning();

      if (!updated) return res.status(404).json({ message: "User not found" });

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "user_role_changed",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "user",
        entityId: String(userId),
        summary: `Changed role of ${updated.email} to ${role}`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.get("/api/estimators", async (_req: Request, res: Response) => {
    try {
      const activeUsers = await db.select({
        id: users.id,
        displayName: users.displayName,
        initials: users.initials,
        email: users.email,
        role: users.role,
      }).from(users).where(eq(users.isActive, true));

      const estimators = activeUsers
        .filter(u => u.initials)
        .map(u => ({
          code: u.initials!,
          label: `${u.initials} — ${u.displayName || u.email}`,
          isAdmin: u.role === "admin",
        }));

      res.json(estimators);
    } catch (error) {
      console.error("[Admin] Get estimators error:", error);
      res.status(500).json({ message: "Failed to get estimators" });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email, displayName, initials, role } = req.body;
      const actorId = (req.session as any)?.userId;

      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      if (!isAllowedDomain(normalizedEmail)) {
        return res.status(400).json({ message: "Email domain is not in the allowed list" });
      }

      const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
      if (existing) {
        return res.status(409).json({ message: "A user with this email already exists" });
      }

      const autoInitials = initials || (displayName ? displayName.split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().substring(0, 3) : "");

      const [newUser] = await db.insert(users).values({
        email: normalizedEmail,
        displayName: displayName || null,
        initials: autoInitials || null,
        role: role || "user",
        isActive: true,
      }).returning();

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "user_created",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "user",
        entityId: String(newUser.id),
        summary: `Created user ${newUser.email}${newUser.displayName ? ` (${newUser.displayName})` : ""}`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.status(201).json(newUser);
    } catch (error) {
      console.error("[Admin] Create user error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id/profile", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { displayName, initials, email, role, dashboardScope, dashboardLayout, assignedRegion } = req.body;
      const actorId = (req.session as any)?.userId;

      const updateFields: Record<string, any> = {};
      if (displayName !== undefined) updateFields.displayName = displayName || null;
      if (initials !== undefined) updateFields.initials = initials || null;
      if (role !== undefined) {
        if (!["user", "admin"].includes(role)) {
          return res.status(400).json({ message: "Invalid role" });
        }
        if (actorId === userId && role !== "admin") {
          return res.status(400).json({ message: "You cannot demote yourself" });
        }
        updateFields.role = role;
      }
      if (dashboardScope !== undefined) updateFields.dashboardScope = dashboardScope || "my_projects";
      if (dashboardLayout !== undefined) updateFields.dashboardLayout = dashboardLayout || "estimator";
      if (assignedRegion !== undefined) updateFields.assignedRegion = assignedRegion || null;
      if (email !== undefined) {
        const normalizedEmail = email.trim().toLowerCase();
        if (!isAllowedDomain(normalizedEmail)) {
          return res.status(400).json({ message: "Email domain is not in the allowed list" });
        }
        const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
        if (existing && existing.id !== userId) {
          return res.status(409).json({ message: "Another user already has this email" });
        }
        updateFields.email = normalizedEmail;
      }

      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const [updated] = await db
        .update(users)
        .set(updateFields)
        .where(eq(users.id, userId))
        .returning();

      if (!updated) return res.status(404).json({ message: "User not found" });

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "user_profile_updated",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "user",
        entityId: String(userId),
        summary: `Updated profile of ${updated.email}`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json(updated);
    } catch (error) {
      console.error("[Admin] Update profile error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get("/api/admin/audit", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { user: userFilter, from, to, action, search, limit: limitParam } = req.query;
      const limit = Math.min(parseInt(limitParam as string) || 100, 500);

      const conditions: any[] = [];

      if (userFilter) {
        conditions.push(like(auditLogs.actorEmail, `%${userFilter}%`));
      }
      if (from) {
        conditions.push(gte(auditLogs.timestamp, new Date(from as string)));
      }
      if (to) {
        const toDate = new Date(to as string);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(auditLogs.timestamp, toDate));
      }
      if (action) {
        conditions.push(eq(auditLogs.actionType, action as string));
      }
      if (search) {
        conditions.push(
          or(
            like(auditLogs.summary, `%${search}%`),
            like(auditLogs.actorEmail, `%${search}%`),
            like(auditLogs.requestPath, `%${search}%`)
          )
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const logs = await db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit);

      res.json(logs);
    } catch (error) {
      console.error("[Admin] Audit log fetch error:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/admin/audit/action-types", requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await db
        .selectDistinct({ actionType: auditLogs.actionType })
        .from(auditLogs)
        .orderBy(auditLogs.actionType);
      res.json(result.map(r => r.actionType));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch action types" });
    }
  });

  // ---- USER PERMISSIONS ----

  // Get all users with their feature access
  app.get("/api/admin/users/permissions/matrix", requireAdmin, async (req: Request, res: Response) => {
    try {
      const allUsers = await db.select().from(users);
      
      const usersWithPermissions = await Promise.all(
        allUsers.map(async (user) => {
          const features = await storage.getUserFeatureAccess(user.id);
          return {
            ...user,
            features,
            availableFeatures: Object.values(FEATURES),
          };
        })
      );

      res.json(usersWithPermissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch permissions matrix" });
    }
  });

  // Update a user's feature access
  app.patch("/api/admin/users/:id/permissions", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { features } = req.body as { features: Feature[] };
      const actorId = (req.session as any)?.userId;

      // Validate features
      const validFeatures = Object.values(FEATURES);
      if (!Array.isArray(features) || !features.every((f) => validFeatures.includes(f))) {
        return res.status(400).json({ message: "Invalid features provided" });
      }

      // Get user
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      // Update permissions
      await storage.setUserFeatureAccess(userId, features);

      // Audit log
      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "user_permissions_changed",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "user",
        entityId: String(userId),
        summary: `Updated permissions for ${user.email}: ${features.join(", ")}`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      const updatedFeatures = await storage.getUserFeatureAccess(userId);
      res.json({ success: true, features: updatedFeatures });
    } catch (error) {
      res.status(500).json({ message: "Failed to update permissions" });
    }
  });

  // Reset user permissions to role defaults
  app.post("/api/admin/users/:id/reset-permissions", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const actorId = (req.session as any)?.userId;

      // Get user
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      // Get default features for the user's role
      const defaultFeatures = DEFAULT_ROLE_FEATURES[user.role] || DEFAULT_ROLE_FEATURES.user;

      // Set permissions to defaults
      await storage.setUserFeatureAccess(userId, defaultFeatures);

      // Audit log
      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "user_permissions_reset",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "user",
        entityId: String(userId),
        summary: `Reset permissions for ${user.email} to ${user.role} defaults`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json({ success: true, features: defaultFeatures });
    } catch (error) {
      res.status(500).json({ message: "Failed to reset permissions" });
    }
  });

  // Get all available features
  app.get("/api/admin/features", requireAdmin, async (req: Request, res: Response) => {
    try {
      res.json(Object.values(FEATURES));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch features" });
    }
  });

  // ---- PERMISSION PROFILES ----

  // Get all permission profiles
  app.get("/api/admin/profiles", requireAdmin, async (req: Request, res: Response) => {
    try {
      const profiles = await db.select().from(permissionProfiles).orderBy(desc(permissionProfiles.createdAt));
      res.json(profiles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch profiles" });
    }
  });

  // Create a new permission profile
  app.post("/api/admin/profiles", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, description, features } = req.body as {
        name: string;
        description?: string;
        features: string[];
      };
      const actorId = (req.session as any)?.userId;

      if (!name || !Array.isArray(features)) {
        return res.status(400).json({ message: "Name and features are required" });
      }

      const [created] = await db
        .insert(permissionProfiles)
        .values({ name, description, features })
        .returning();

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "profile_created",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "profile",
        entityId: String(created.id),
        summary: `Created permission profile "${name}" with ${features.length} features`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json(created);
    } catch (error: any) {
      if (error.message?.includes("unique")) {
        return res.status(400).json({ message: "Profile name already exists" });
      }
      res.status(500).json({ message: "Failed to create profile" });
    }
  });

  // Update a permission profile
  app.patch("/api/admin/profiles/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const profileId = parseInt(req.params.id);
      const { name, description, features } = req.body as {
        name?: string;
        description?: string;
        features?: string[];
      };
      const actorId = (req.session as any)?.userId;

      const [updated] = await db
        .update(permissionProfiles)
        .set({
          name: name || undefined,
          description: description || undefined,
          features: features || undefined,
          updatedAt: new Date(),
        })
        .where(eq(permissionProfiles.id, profileId))
        .returning();

      if (!updated) return res.status(404).json({ message: "Profile not found" });

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "profile_updated",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "profile",
        entityId: String(profileId),
        summary: `Updated permission profile "${updated.name}"`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Delete a permission profile
  app.delete("/api/admin/profiles/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const profileId = parseInt(req.params.id);
      const actorId = (req.session as any)?.userId;

      const [deleted] = await db
        .delete(permissionProfiles)
        .where(eq(permissionProfiles.id, profileId))
        .returning();

      if (!deleted) return res.status(404).json({ message: "Profile not found" });

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "profile_deleted",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "profile",
        entityId: String(profileId),
        summary: `Deleted permission profile "${deleted.name}"`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete profile" });
    }
  });

  // Assign a profile to a user (applies profile features as user's permissions)
  app.post("/api/admin/users/:userId/assign-profile/:profileId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const profileId = parseInt(req.params.profileId);
      const actorId = (req.session as any)?.userId;

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      const [profile] = await db.select().from(permissionProfiles).where(eq(permissionProfiles.id, profileId));
      if (!profile) return res.status(404).json({ message: "Profile not found" });

      // Apply profile features to user
      await storage.setUserFeatureAccess(userId, profile.features);

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "profile_assigned",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "user",
        entityId: String(userId),
        summary: `Assigned profile "${profile.name}" to ${user.email}`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json({ success: true, features: profile.features });
    } catch (error) {
      res.status(500).json({ message: "Failed to assign profile" });
    }
  });
}
