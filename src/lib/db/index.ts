import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = global as typeof global & { pgClient?: postgres.Sql };

if (!globalForDb.pgClient) {
  globalForDb.pgClient = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 10,
  });
}

export const db = drizzle(globalForDb.pgClient, { schema });
