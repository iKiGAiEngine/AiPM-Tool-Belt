import { db } from "./db";
import { users, userFeatureAccess, DEFAULT_ROLE_FEATURES } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function initializePermissions() {
  try {
    // Create table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_feature_access (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        feature VARCHAR(50) NOT NULL,
        granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
