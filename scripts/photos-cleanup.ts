import { createRequire } from "node:module";
const { loadEnvConfig } = createRequire(import.meta.url)(
  "@next/env",
) as typeof import("@next/env");
loadEnvConfig(process.cwd());
const { cleanupPhotos } = await import("../src/modules/menu-photos/server");
const { pool } = await import("../src/db");
try {
  const apply = process.argv.includes("--apply");
  const result = await cleanupPhotos(apply);
  console.log(
    JSON.stringify({ event: "menu_photo_cleanup", dryRun: !apply, ...result }),
  );
} catch {
  console.error(JSON.stringify({ event: "menu_photo_cleanup_failed" }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
