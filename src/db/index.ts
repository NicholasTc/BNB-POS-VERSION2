import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";
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
pool.on("error", () =>
  console.error(JSON.stringify({ event: "database_pool_error" })),
);
export const db = drizzle(pool, { schema });
