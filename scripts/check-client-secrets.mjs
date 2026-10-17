import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd());
const secrets = ["DATABASE_URL", "BETTER_AUTH_SECRET", "PIN_PEPPER"]
  .map((k) => process.env[k])
  .filter(Boolean);
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? files(directory + "/" + e.name)
          : [directory + "/" + e.name],
      ),
    )
  ).flat();
}
const paths = (await files(".next/static")).filter((p) => p.endsWith(".js"));
if (!paths.length || secrets.length !== 3)
  throw new Error("Build assets and validated local secrets are required.");
for (const path of paths) {
  const text = await readFile(path, "utf8");
  if (secrets.some((secret) => text.includes(secret)))
    throw new Error(
      "Server secret detected in client assets; do not distribute this build.",
    );
}
console.log(`Client secret scan passed (${paths.length} JavaScript assets).`);
