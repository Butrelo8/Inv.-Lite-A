/**
 * Create a user for authentication.
 * Run: npm run create-user -- admin YourPassword123
 *      npm run create-user -- admin YourPassword123 editor
 *
 * Usage: npm run create-user -- <username> <password> [role]
 * Role: admin | editor | viewer (default: viewer)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { users, USER_ROLES } from "../shared/schema";

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  const roleArg = process.argv[4]?.toLowerCase();

  if (!username || !password) {
    console.error("Usage: npm run create-user -- <username> <password> [role]");
    console.error("Example: npm run create-user -- admin mySecurePassword123 editor");
    console.error("Role: admin | editor | viewer (default: viewer)");
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }

  const role = roleArg && USER_ROLES.includes(roleArg as any) ? roleArg : "viewer";

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const [user] = await db
      .insert(users)
      .values({ username: username.trim(), passwordHash, role })
      .returning();

    if (user) {
      console.log(`✓ User "${username}" created successfully.`);
    }
  } catch (err: any) {
    if (err?.code === "23505") {
      console.error(`User "${username}" already exists.`);
    } else {
      console.error("Error creating user:", err.message);
    }
    process.exit(1);
  }

  process.exit(0);
}

main();
