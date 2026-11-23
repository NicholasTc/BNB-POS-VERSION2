export const DEVICE_TRUST_DAYS = 90;
export const DEVICE_TRUST_SECONDS = DEVICE_TRUST_DAYS * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DeviceTrustStatus = {
  state: "unpaired" | "connected" | "expired";
  expiresAt: string | null;
  daysRemaining: number;
};

/** Report actual stored expiry; reading never renews or replaces a pairing. */
export function deviceTrustStatus(
  pairing: { paired: boolean; expiresAt: Date } | undefined,
  now = Date.now(),
): DeviceTrustStatus {
  if (!pairing?.paired)
    return { state: "unpaired", expiresAt: null, daysRemaining: 0 };
  const remaining = pairing.expiresAt.getTime() - now;
  return {
    state: remaining > 0 ? "connected" : "expired",
    expiresAt: pairing.expiresAt.toISOString(),
    daysRemaining: Math.max(0, Math.ceil(remaining / DAY_MS)),
  };
}
