import { describe, expect, it } from "vitest";
import { deviceTrustStatus, DEVICE_TRUST_SECONDS } from "../../src/modules/device-trust/policy";

describe("device trust expiry", () => {
  const now = Date.UTC(2026, 10, 21, 12);
  it("counts remaining time up to the next day without extending it", () => {
    expect(deviceTrustStatus({ paired: true, expiresAt: new Date(now + DEVICE_TRUST_SECONDS * 1000) }, now))
      .toEqual({ state: "connected", expiresAt: new Date(now + 90 * 86400000).toISOString(), daysRemaining: 90 });
    expect(deviceTrustStatus({ paired: true, expiresAt: new Date(now + 1) }, now).daysRemaining).toBe(1);
    expect(deviceTrustStatus({ paired: true, expiresAt: new Date(now + 86400001) }, now).daysRemaining).toBe(2);
  });
  it("uses a legacy pairing's real expiry rather than assuming ninety days", () => {
    expect(deviceTrustStatus({ paired: true, expiresAt: new Date(now + 30 * 86400000) }, now).daysRemaining).toBe(30);
  });
  it("expires exactly at the deadline and never reports negative days", () => {
    for (const remaining of [0, -1, -86400001]) {
      expect(deviceTrustStatus({ paired: true, expiresAt: new Date(now + remaining) }, now))
        .toMatchObject({ state: "expired", daysRemaining: 0 });
    }
  });
  it("does not report revoked or absent devices as trusted", () => {
    const absent = { state: "unpaired", expiresAt: null, daysRemaining: 0 };
    expect(deviceTrustStatus(undefined, now)).toEqual(absent);
    expect(deviceTrustStatus({ paired: false, expiresAt: new Date(now + 86400000) }, now)).toEqual(absent);
  });
});
