import { db } from "./db";
import { users, userFeatureAccess, DEFAULT_ROLE_FEATURES, permissionProfiles, FEATURES } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

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
      ];

      for (const profile of defaultProfiles) {
        await db.insert(permissionProfiles).values(profile);
      }
      console.log("[Permissions] Created default profiles linked to roles");
    }

    // For each user without permissions, assign default permissions based on their role
    const allUsers = await db.select().from(users);

    for (const user of allUsers) {
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
