import { createRequire } from "node:module";
import { existsSync } from "node:fs";
const { loadEnvConfig } = createRequire(process.cwd() + "/package.json")(
  "@next/env",
) as typeof import("@next/env");
loadEnvConfig(process.cwd());
// Next deliberately skips .env.local in NODE_ENV=test. Explicit local opt-in;
// the isolated test URL below is still mandatory before any database operation.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== "/lisi_test" ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error("Tests require isolated loopback /lisi_test database.");
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3100";
process.env.SHEETS_SYNC_MODE = "off";
