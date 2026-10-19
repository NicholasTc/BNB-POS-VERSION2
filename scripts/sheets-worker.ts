import { createRequire } from "node:module";
const { loadEnvConfig } = createRequire(import.meta.url)(
  "@next/env",
) as typeof import("@next/env");
loadEnvConfig(process.cwd());
const { sheetsConfig, sheetsErrorCode } =
  await import("../src/modules/sheets/config");
const { syncSheets } = await import("../src/modules/sheets/sync");
const { googleSheets } = await import("../src/modules/sheets/google");
const { pool } = await import("../src/db");
const once = process.argv.includes("--once");
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
try {
  const config = sheetsConfig();
  do {
    const result = await syncSheets(pool, config, (signal) =>
      googleSheets(config!, signal),
    );
    console.log(JSON.stringify({ event: "sheets_sync", ...result }));
    if (result.state === "off") break;
    if (once) {
      if (result.state === "retry") process.exitCode = 1;
      break;
    }
    // A bounded independent worker. No owner page needs to stay open.
    for (let i = 0; i < 30 && !stopping; i++)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (!stopping);
} catch (error) {
  console.error(
    JSON.stringify({
      event: "sheets_sync_failed",
      code: sheetsErrorCode(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
