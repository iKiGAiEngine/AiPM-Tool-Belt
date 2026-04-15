import bcrypt from "bcrypt";
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
  },
  {
    email: "test-user@aipmapp.com",
    password: "NBS4130",
    displayName: "Test User",
    initials: "TU",
    role: "user" as const,
    status: "active",
    isActive: true,
  },
  {
    email: "test-invited@aipmapp.com",
    password: null,
    displayName: "Test Invited",
    initials: "TI",
    role: "user" as const,
    status: "invited",
    isActive: false,
  },
];

export async function runDevSeed(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;

  try {
    for (const account of DEV_ACCOUNTS) {
      const [existing] = await db.select().from(users).where(eq(users.email, account.email));
      if (!existing) {
        const passwordHash = account.password ? await bcrypt.hash(account.password, 12) : null;
        await db.insert(users).values({
          email: account.email,
          displayName: account.displayName,
          initials: account.initials,
          role: account.role,
          status: account.status,
          isActive: account.isActive,
          passwordHash,
        });
        console.log(`[DevSeed] Created dev account: ${account.email}`);
      }
    }
  } catch (error: any) {
    console.error("[DevSeed] Error seeding dev accounts:", error.message);
  }
}
