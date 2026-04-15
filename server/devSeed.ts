import bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEV_ACCOUNTS = [
  {
    email: "test-admin@aipmapp.com",
    password: "NBS4130",
    displayName: "Test Admin",
    initials: "TA",
    role: "admin" as const,
    status: "active",
    isActive: true,
    invited: false,
  },
  {
    email: "test-user@aipmapp.com",
    password: "NBS4130",
    displayName: "Test User",
    initials: "TU",
    role: "user" as const,
    status: "active",
    isActive: true,
    invited: false,
  },
  {
    email: "test-invited@aipmapp.com",
    password: null,
    displayName: "Test Invited",
    initials: "TI",
    role: "user" as const,
    status: "invited",
    isActive: false,
    invited: true,
  },
];

export async function runDevSeed(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;

  try {
    for (const account of DEV_ACCOUNTS) {
      const [existing] = await db.select().from(users).where(eq(users.email, account.email));
      if (!existing) {
        const passwordHash = account.password ? await bcrypt.hash(account.password, 12) : null;
        const resetToken = account.invited
          ? createHash("sha256").update(randomBytes(32).toString("hex")).digest("hex")
          : null;
        const resetTokenExpiresAt = account.invited
          ? new Date(Date.now() + 72 * 60 * 60 * 1000)
          : null;
        await db.insert(users).values({
          email: account.email,
          displayName: account.displayName,
          initials: account.initials,
          role: account.role,
          status: account.status,
          isActive: account.isActive,
          passwordHash,
          resetToken,
          resetTokenExpiresAt,
        });
        console.log(`[DevSeed] Created dev account: ${account.email}`);
      } else if (account.invited && existing.status !== "invited") {
        await db.update(users).set({ status: "invited", isActive: false }).where(eq(users.id, existing.id));
        console.log(`[DevSeed] Reset status to invited for: ${account.email}`);
      }
    }
  } catch (error: any) {
    console.error("[DevSeed] Error seeding dev accounts:", error.message);
  }
}
