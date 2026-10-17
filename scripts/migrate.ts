import { createRequire } from "node:module";
const { loadEnvConfig } = createRequire(process.cwd() + "/package.json")(
  "@next/env",
) as typeof import("@next/env");
loadEnvConfig(process.cwd());
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { db, pool } = await import("../src/db/index");
try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
