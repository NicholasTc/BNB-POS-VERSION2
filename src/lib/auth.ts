import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "./env";
const config = env();
export const OWNER_SESSION_SECONDS = 8 * 60 * 60;
export const OWNER_IDLE_SECONDS = 15 * 60;
export const auth = betterAuth({
  appName: "LISI POS",
  baseURL: config.BETTER_AUTH_URL,
  secret: config.BETTER_AUTH_SECRET,
  logger: { disabled: true },
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: OWNER_SESSION_SECONDS,
    updateAge: 60 * 60,
    disableSessionRefresh: true,
    cookieCache: { enabled: false },
  },
  trustedOrigins: [config.BETTER_AUTH_URL],
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: { "/sign-in/email": { window: 60, max: 10 } },
  },
  advanced: {
    useSecureCookies: new URL(config.BETTER_AUTH_URL).protocol === "https:",
    defaultCookieAttributes: { httpOnly: true, sameSite: "strict" },
  },
});
