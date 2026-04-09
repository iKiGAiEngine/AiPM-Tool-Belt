import { db } from "./db";
import { users, userFeatureAccess, DEFAULT_ROLE_FEATURES, permissionProfiles, FEATURES } from "@shared/schema";
import { sql, eq, desc } from "drizzle-orm";

export async function initializePermissions() {
  try {
    // Create tables if they don't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_feature_access (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        feature VARCHAR(50) NOT NULL,
        granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS permission_profiles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        features JSONB DEFAULT '[]',
        linked_role VARCHAR(50),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add linked_role column if it doesn't exist (for existing tables)
    try {
      await db.execute(sql`
        ALTER TABLE permission_profiles 
        ADD COLUMN IF NOT EXISTS linked_role VARCHAR(50)
      `);
    } catch (err: any) {
      // Column might already exist, ignore error
    }

    // Create default profiles if they don't exist
    const existingProfiles = await db.select().from(permissionProfiles);
    if (existingProfiles.length === 0) {
      const defaultProfiles = [
        {
          name: "Full Access",
          description: "All features (Admin)",
          linkedRole: "admin",
          features: Object.values(FEATURES),
        },
        {
          name: "Accounting",
          description: "Proposal Log, Vendor Database, Settings",
          linkedRole: "accounting",
          features: [FEATURES.PROPOSAL_LOG, FEATURES.VENDOR_DATABASE, FEATURES.CENTRAL_SETTINGS],
        },
        {
          name: "Project Manager",
          description: "Proposal Log, Submittal Builder, Schedule Converter, Spec Extractor, Quote Parser, Project Start",
          linkedRole: "project_manager",
          features: [
            FEATURES.PROPOSAL_LOG,
            FEATURES.SUBMITTAL_BUILDER,
            FEATURES.SCHEDULE_CONVERTER,
            FEATURES.SPEC_EXTRACTOR,
            FEATURES.QUOTE_PARSER,
            FEATURES.PROJECT_START,
          ],
        },
        {
          name: "Standard User",
          description: "Proposal Log, Submittal Builder",
          linkedRole: "user",
          features: [FEATURES.PROPOSAL_LOG, FEATURES.SUBMITTAL_BUILDER],
        },
        {
          name: "Executive",
          description: "Proposal Log, Project Log, Draft Review",
          linkedRole: null, // Not auto-linked to a role, but available for manual assignment
          features: [
            FEATURES.PROPOSAL_LOG,
            FEATURES.DRAFT_REVIEW,
          ],
        },
      ];

      for (const profile of defaultProfiles) {
        await db.insert(permissionProfiles).values(profile);
      }
      console.log("[Permissions] Created default profiles linked to roles");
    }

    // Add Executive profile if it doesn't exist
    const executiveProfile = await db.select().from(permissionProfiles).where(sql`name = 'Executive'`);
    if (executiveProfile.length === 0) {
      await db.insert(permissionProfiles).values({
        name: "Executive",
        description: "Proposal Log, Project Log, Draft Review",
        linkedRole: null,
        features: [FEATURES.PROPOSAL_LOG, FEATURES.DRAFT_REVIEW],
      });
      console.log("[Permissions] Created Executive profile");
    }

    // Clean up duplicate users (keep the oldest, delete newer duplicates)
    const allUsers = await db.select().from(users).orderBy(users.createdAt);
    const emailMap = new Map<string, number>();
    const duplicatesToDelete: number[] = [];

    for (const user of allUsers) {
      const email = user.email.toLowerCase();
      if (emailMap.has(email)) {
        // This is a duplicate, mark for deletion
        duplicatesToDelete.push(user.id);
      } else {
        emailMap.set(email, user.id);
      }
    }

    if (duplicatesToDelete.length > 0) {
      console.log(`[Permissions] Found ${duplicatesToDelete.length} duplicate users, deleting...`);
      for (const userId of duplicatesToDelete) {
        try {
          // Delete user feature access first
          await db.delete(userFeatureAccess).where(eq(userFeatureAccess.userId, userId));
          // Then delete the user
          await db.delete(users).where(eq(users.id, userId));
          console.log(`[Permissions] Deleted duplicate user ID ${userId}`);
        } catch (err: any) {
          console.error(`[Permissions] Failed to delete user ${userId}:`, err.message);
        }
      }
    }

    // Update Standard User profile to remove submittal-builder (Estimators don't need it)
    await db.execute(sql`
      UPDATE permission_profiles
      SET features = (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(features) AS elem
        WHERE elem::text NOT IN ('"submittal-builder"')
      ),
      updated_at = NOW()
      WHERE linked_role = 'user'
    `);

    // Remove submittal-builder from all Estimator (user role) accounts
    const estimatorUsers = await db.select({ id: users.id }).from(users).where(eq(users.role, "user"));
    for (const eu of estimatorUsers) {
      await db.execute(sql`
        DELETE FROM user_feature_access
        WHERE user_id = ${eu.id} AND feature = 'submittal-builder'
      `);
    }
    if (estimatorUsers.length > 0) {
      console.log(`[Permissions] Removed submittal-builder from ${estimatorUsers.length} Estimator user(s)`);
    }

    // estimating-module: admin-only feature.
    // Step 1 — one-time normalization: on first boot after this feature was introduced,
    //   revoke estimating-module from any non-admin user who may have inherited it via
    //   an earlier catch-all seed. We track completion in the system_settings table
    //   (not in the user-managed permission_profiles table) so admins cannot accidentally
    //   re-trigger it. After normalization runs once, manual grants via the Permissions UI persist.
    const normKey = "estimating_module_normalized_v1";
    const normFlag = await db.execute(sql`
      SELECT value FROM system_settings WHERE key = ${normKey} LIMIT 1
    `);
    if (normFlag.rows.length === 0) {
      // First-time normalization: revoke from non-admins so role defaults are authoritative.
      const result = await db.execute(sql`
        DELETE FROM user_feature_access
        WHERE feature = 'estimating-module'
          AND user_id IN (
            SELECT id FROM users WHERE role != 'admin'
          )
        RETURNING user_id
      `);
      const revokedCount = result.rows.length;
      if (revokedCount > 0) {
        console.log(`[Permissions] One-time normalization: removed estimating-module from ${revokedCount} non-admin user(s)`);
      }
      // Persist the completion flag so this never runs again.
      await db.execute(sql`
        INSERT INTO system_settings (key, value)
        VALUES (${normKey}, 'done')
        ON CONFLICT (key) DO NOTHING
      `);
      console.log("[Permissions] estimating-module normalization complete");
    }

    // Step 2 — seed: grant estimating-module to any admin who doesn't have it yet.
    //   This handles new admin users created after the normalization ran.
    const estimatingAdmins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    let grantedEstimatingCount = 0;
    for (const au of estimatingAdmins) {
      const existing = await db.execute(sql`
        SELECT id FROM user_feature_access
        WHERE user_id = ${au.id} AND feature = 'estimating-module'
        LIMIT 1
      `);
      if (existing.rows.length === 0) {
        await db.execute(sql`
          INSERT INTO user_feature_access (user_id, feature)
          VALUES (${au.id}, 'estimating-module')
        `);
        grantedEstimatingCount++;
      }
    }
    if (grantedEstimatingCount > 0) {
      console.log(`[Permissions] Granted estimating-module to ${grantedEstimatingCount} Admin user(s)`);
    }

    // For each remaining user without permissions, assign default permissions based on their role
    const remainingUsers = await db.select().from(users);

    for (const user of remainingUsers) {
      const existingAccess = await db
        .select()
        .from(userFeatureAccess)
        .where(sql`${userFeatureAccess.userId} = ${user.id}`);

      // If user has no permissions, assign defaults based on role
      if (existingAccess.length === 0) {
        const defaultFeatures = DEFAULT_ROLE_FEATURES[user.role] || DEFAULT_ROLE_FEATURES.user;

        if (defaultFeatures.length > 0) {
          await db.insert(userFeatureAccess).values(
            defaultFeatures.map((feature) => ({
              userId: user.id,
              feature,
            }))
          );
        }
      }
    }

    console.log("[Permissions] Initialized user feature access");
  } catch (error: any) {
    console.error("[Permissions] Failed to initialize:", error.message);
    // Don't fail startup if permissions table initialization fails
    // The system will still work, just without permission checks
  }
}
