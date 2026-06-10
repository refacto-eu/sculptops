/**
 * Creates test users for role-based access control testing.
 *
 * Users created:
 *   adminTest@test.com  / AdminTest1!  → admin
 *   memberTest@test.com / MemberTest1! → member
 *   viewerTest@test.com / ViewerTest1! → viewer
 *
 * All three share a "Test Organization".
 *
 * Run: node scripts/seed-test-users.mjs
 * Requires DATABASE_URL to be set in the environment.
 */

import { createHash, randomUUID } from "crypto";
import { createHmac } from "crypto";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }

const sql = postgres(url, { max: 1 });

const ORG_ID    = "00000000-0000-0000-0000-000000000010";
const ORG_SLUG  = "test-org";
const ORG_NAME  = "Test Organization";

const USERS = [
  { id: "00000000-0000-0000-0000-000000000011", email: "adminTest@test.com",  name: "Admin Test",  password: "AdminTest1!",  role: "admin"  },
  { id: "00000000-0000-0000-0000-000000000012", email: "memberTest@test.com", name: "Member Test", password: "MemberTest1!", role: "member" },
  { id: "00000000-0000-0000-0000-000000000013", email: "viewerTest@test.com", name: "Viewer Test", password: "ViewerTest1!", role: "viewer" },
];

// Ensure organization exists
const orgExists = await sql`SELECT id FROM organizations WHERE id = ${ORG_ID}`;
if (orgExists.length === 0) {
  await sql`INSERT INTO organizations (id, name, slug) VALUES (${ORG_ID}, ${ORG_NAME}, ${ORG_SLUG}) ON CONFLICT DO NOTHING`;
  console.log(`[seed] Created organization: ${ORG_NAME}`);
} else {
  console.log(`[seed] Organization already exists: ${ORG_NAME}`);
}

for (const u of USERS) {
  const hash = await bcrypt.hash(u.password, 10);

  // Upsert user
  await sql`
    INSERT INTO users (id, email, name, password)
    VALUES (${u.id}, ${u.email}, ${u.name}, ${hash})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password
  `;

  // Upsert membership
  await sql`
    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (${ORG_ID}, ${u.id}, ${u.role})
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role
  `;

  console.log(`[seed] ${u.role.padEnd(6)} → ${u.email}  (password: ${u.password})`);
}

await sql.end();
console.log("\n[seed] Done. You can now log in with any of the accounts above.");
