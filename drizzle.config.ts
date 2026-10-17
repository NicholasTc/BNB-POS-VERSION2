import { createRequire } from "node:module";
const { loadEnvConfig } = createRequire(process.cwd() + "/package.json")(
  "@next/env",
) as typeof import("@next/env");
import { defineConfig } from "drizzle-kit";
loadEnvConfig(process.cwd());
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
