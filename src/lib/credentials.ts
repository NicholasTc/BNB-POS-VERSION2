import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { env } from "./env";
const scrypt = promisify(scryptCallback);
/** Hash an opaque device token or canonical operation payload for equality checks; never store the raw bearer token in SQL. */
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
/** Key the four-digit PIN lookup with the private pepper so raw PIN values are never indexed or returned. */
export const pinLookup = (pin: string) =>
  createHmac("sha256", env().PIN_PEPPER).update(pin).digest("hex");
/** Validate exactly four digits, add a fresh salt and private pepper, then scrypt into the stored employee hash. */
export async function hashPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly four digits");
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(pin + env().PIN_PEPPER, salt, 64)) as Buffer;
  return salt + ":" + hash.toString("hex");
}
/** Recompute the salted/peppered PIN hash and compare equal-length buffers in constant time; no credentials are returned. */
export async function verifyPin(pin: string, stored: string) {
  const [salt, encoded] = stored.split(":");
  if (!salt || !encoded || !/^\d{4}$/.test(pin)) return false;
  const candidate = (await scrypt(pin + env().PIN_PEPPER, salt, 64)) as Buffer;
  const hash = Buffer.from(encoded, "hex");
  return candidate.length === hash.length && timingSafeEqual(candidate, hash);
}
