/** Server-only business pool → Drizzle schema client. Diagnostics use a separate bounded pool; collecting a pool error does not wait for persistence. */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { recordDiagnostic } from "@/modules/diagnostics/record";
const globalDb = globalThis as unknown as { lisiPool?: Pool };
export const pool =
  globalDb.lisiPool ??
  new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 4000,
    query_timeout: 5000,
  });
if (process.env.NODE_ENV !== "production") globalDb.lisiPool = pool;
pool.on("error", error => {
  console.error(JSON.stringify({ event: "database_pool_error" }));
  recordDiagnostic({ kind: "database_connection", source: "server", error });
});
export const db = drizzle(pool, { schema });
