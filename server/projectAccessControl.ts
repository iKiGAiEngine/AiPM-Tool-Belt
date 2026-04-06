import { db } from "./db";
import { users, projects } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Check if a user has permission to access/modify a project
 * Returns true if:
 * - User is an admin, OR
 * - User created the project
 */
export async function userCanAccessProject(
  userId: number | null,
  projectDbId: number | null,
): Promise<boolean> {
  if (!userId || !projectDbId) return false;

  // Get user and check if admin
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return false;

  // Admins can access all projects
  if (user.role === "admin") return true;

  // Check if user created the project
  const [project] = await db.select().from(projects).where(eq(projects.id, projectDbId));
  if (!project) return false;

  // Compare user identifier with project creator
  const userIdentifier = (user.displayName || user.email || "").toLowerCase();
  const creatorIdentifier = (project.createdBy || "").toLowerCase();

  return userIdentifier === creatorIdentifier;
}
