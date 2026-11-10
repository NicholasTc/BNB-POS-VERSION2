import { createRequire } from "node:module";
import { z } from "zod";
const { loadEnvConfig } = createRequire(import.meta.url)(
  "@next/env",
) as typeof import("@next/env");
loadEnvConfig(process.cwd());
export async function runProvisioning(role: "owner" | "admin") {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 4096) throw new Error("Provisioning input too large.");
    chunks.push(Buffer.from(chunk));
  }
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
      password: z.string().min(12).max(128),
      reset: z.boolean().default(false),
    })
    .strict()
    .safeParse(JSON.parse(Buffer.concat(chunks).toString()));
  if (!parsed.success)
    throw new Error("Email and 12–128 character password required.");
  const { pool } = await import("../src/db");
  try {
    const { provisionIdentity } =
      await import("../src/modules/account-manager/provision");
    await provisionIdentity(role, parsed.data);
    console.log(
      `${role === "admin" ? "Administrator" : "Owner"} credentials saved. Only that account's previous sessions are revoked on reset.`,
    );
  } finally {
    await pool.end();
  }
}
export function provisioningFailed(error: unknown) {
  const allowed = [
    "Account exists. Explicit reset required.",
    "Owner accounts exist. Use Account manager.",
    "Email and 12–128 character password required.",
  ];
  console.error(
    error instanceof Error && allowed.includes(error.message)
      ? error.message
      : "Account provisioning failed. Check database availability and input.",
  );
  process.exitCode = 1;
}
