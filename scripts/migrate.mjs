import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, "..", "drizzle");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

console.log("[migrate] running migrations from", migrationsFolder);
try {
  await migrate(db, { migrationsFolder });
  console.log("[migrate] done");
} finally {
  await sql.end();
}
