import "./setup";
import { Pool } from "pg";

// Each runner owns one session lock for its complete lifetime. Fixtures in a
// second runner must wait, including when commands are launched accidentally.
export default async function databaseLock() {
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 0,
  });
  try {
    await pool.query("SET statement_timeout = '60s'");
    await pool.query("SELECT pg_advisory_lock(891103)");
  } catch {
    await pool.end();
    throw new Error(
      "Cannot obtain exclusive test-database lock within 60 seconds.",
    );
  }
  return async () => {
    await pool.end();
  };
}
