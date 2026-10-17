import { defineConfig, devices } from "@playwright/test";
import { createRequire } from "node:module";
const { loadEnvConfig } = createRequire(process.cwd() + "/package.json")(
  "@next/env",
) as typeof import("@next/env");
loadEnvConfig(process.cwd());
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: "./tests/e2e/setup.ts",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1180, height: 820 },
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
    },
  },
});
