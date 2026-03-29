import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Supabase/hosted PostgreSQL uses an intermediate CA not in Node.js default trust store.
// SSL is still enforced (connection is encrypted); certificate chain verification is skipped
// because the hosted provider's CA bundle is not bundled with Node.js.
export const sql = postgres(process.env.DATABASE_URL!, {
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(sql, { schema });
