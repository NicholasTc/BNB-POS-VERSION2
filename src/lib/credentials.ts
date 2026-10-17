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
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const pinLookup = (pin: string) =>
  createHmac("sha256", env().PIN_PEPPER).update(pin).digest("hex");
export async function hashPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly four digits");
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(pin + env().PIN_PEPPER, salt, 64)) as Buffer;
  return salt + ":" + hash.toString("hex");
}
export async function verifyPin(pin: string, stored: string) {
  const [salt, encoded] = stored.split(":");
  if (!salt || !encoded || !/^\d{4}$/.test(pin)) return false;
  const candidate = (await scrypt(pin + env().PIN_PEPPER, salt, 64)) as Buffer;
  const hash = Buffer.from(encoded, "hex");
  return candidate.length === hash.length && timingSafeEqual(candidate, hash);
}
