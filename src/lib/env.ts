import { z } from "zod";
export const environmentSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((v) => /^postgres(ql)?:/.test(v), "Use a PostgreSQL URL"),
  BETTER_AUTH_URL: z
    .url()
    .refine(
      (v) =>
        process.env.NODE_ENV !== "production" ||
        new URL(v).protocol === "https:" ||
        ["127.0.0.1", "localhost"].includes(new URL(v).hostname),
      "HTTPS is required outside loopback",
    ),
  BETTER_AUTH_SECRET: z.string().min(48),
  PIN_PEPPER: z.string().min(48),
});
export function readEnvironment(
  input: Record<string, string | undefined> = process.env,
) {
  const result = environmentSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid server configuration: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  return result.data;
}
export const env = () => readEnvironment();
