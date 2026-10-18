import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { db, pool } from "../../src/db";
import { user, account } from "../../src/db/schema";
import {
  POST as authenticate,
  GET as authGet,
} from "../../src/app/api/auth/[...all]/route";
import { GET as owner } from "../../src/app/api/owner/route";
import { GET as reports } from "../../src/app/api/owner/report/route";
import {
  GET as employees,
  POST as editEmployee,
} from "../../src/app/api/owner/employees/route";
import {
  GET as menu,
  POST as editMenu,
} from "../../src/app/api/owner/menu/route";
import { POST as device } from "../../src/app/api/owner/device/route";
import { POST as preferences } from "../../src/app/api/owner/preferences/route";
import { GET as cashier } from "../../src/app/api/pos/route";
import {
  pairDevice,
  attendanceAction,
  saveEmployee,
} from "../../src/modules/attendance";
const origin = "http://127.0.0.1:3100",
  email = "owner@test.local",
  password = "test-owner-password-2026";
const req = (
  path: string,
  cookie = "",
  payload?: unknown,
  extra: Record<string, string> = {},
) =>
  new Request(origin + path, {
    method: payload === undefined ? "GET" : "POST",
    headers: { cookie, origin, "content-type": "application/json", ...extra },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
const reads = [owner, reports, employees, menu];
const writes = [editEmployee, editMenu, device, preferences];
async function denied(cookie = "", extra: Record<string, string> = {}) {
  for (const route of reads)
    expect(
      (await route(req("/api/owner", cookie, undefined, extra))).status,
    ).toBe(401);
  for (const route of writes)
    expect((await route(req("/api/owner", cookie, {}, extra))).status).toBe(
      401,
    );
}
async function login() {
  const response = await authenticate(
    req("/api/auth/sign-in/email", "", { email, password }),
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE owner_user,employee,device,menu_item,throttle,auth_rate_limit CASCADE",
  );
  await db.insert(user).values({ id: "owner", email, name: "Pemilik" });
  await db.insert(account).values({
    id: "boundary",
    accountId: "owner",
    userId: "owner",
    providerId: "credential",
    password: await hashPassword(password),
  });
});
afterAll(async () => {
  await pool.end();
});
describe("owner/cashier trust boundary", () => {
  it.each([
    "anonymous",
    "paired browser",
    "active employee",
    "forged owner cookie",
  ])("denies all owner reads/writes to %s", async (kind) => {
    let cookie = "";
    if (kind !== "anonymous") {
      const token = await pairDevice();
      cookie = "lisi_device=" + token;
      if (kind === "active employee") {
        await saveEmployee({ name: "Ayu", pin: "0123", active: true });
        await attendanceAction(token, "clock-in", "0123");
      }
      if (kind === "forged owner cookie")
        cookie +=
          "; better-auth.session_token=forged.owner.signature; better-auth.session_data=" +
          encodeURIComponent(JSON.stringify({ user: { id: "owner" } }));
    }
    await denied(cookie, {
      "x-user-id": "owner",
      "x-role": "owner",
      authorization: "Bearer 0123",
    });
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM owner_preferences"))
        .rows[0].n,
    ).toBe(0);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM menu_item")).rows[0].n,
    ).toBe(0);
  });
  it("employee identity and pairing never produce an owner session or expose credentials", async () => {
    const token = await pairDevice();
    await saveEmployee({ name: "Ayu", pin: "0123", active: true });
    await attendanceAction(token, "clock-in", "0123");
    const cookie = "lisi_device=" + token;
    expect(
      await (await authGet(req("/api/auth/get-session", cookie))).json(),
    ).toBeNull();
    const text = await (await cashier(req("/api/pos", cookie))).text();
    for (const secret of [
      "pinHash",
      "pinLookup",
      "password",
      "session_token",
      email,
    ])
      expect(text).not.toContain(secret);
    expect(
      (
        await authenticate(
          req("/api/auth/sign-in/email", "", { email, password: "0123" }),
        )
      ).status,
    ).toBe(401);
  });
  it("rejects expired, revoked and over-eight-hour sessions on every owner route", async () => {
    const old = await login();
    await pool.query(
      "UPDATE owner_session SET created_at=now()-interval '9 hours',expires_at=now()+interval '1 hour'",
    );
    await denied(old);
    const expired = await login();
    await pool.query(
      "UPDATE owner_session SET created_at=now(),expires_at=now()-interval '1 second'",
    );
    await denied(expired);
    const revoked = await login();
    await pool.query("TRUNCATE owner_session");
    await denied(revoked);
  });
  it("keeps absolute session expiry and HttpOnly Strict host-only cookies", async () => {
    const response = await authenticate(
      req("/api/auth/sign-in/email", "", { email, password }),
    );
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.includes("session_token="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).toMatch(/Max-Age=28800/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const token = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    await pool.query(
      "UPDATE owner_session SET expires_at=now()+interval '30 minutes',updated_at=now()-interval '2 minutes'",
    );
    const before = (await pool.query("SELECT expires_at FROM owner_session"))
      .rows[0].expires_at;
    expect((await owner(req("/api/owner", token))).status).toBe(200);
    expect(
      (await pool.query("SELECT expires_at FROM owner_session")).rows[0]
        .expires_at,
    ).toEqual(before);
  });
  it("enforces owner inactivity on the server and background reads never count as activity", async () => {
    const cookie = await login();
    await pool.query(
      "UPDATE owner_session SET updated_at=now()-interval '14 minutes'",
    );
    const old = (await pool.query("SELECT updated_at FROM owner_session"))
      .rows[0].updated_at;
    expect(
      (
        await owner(
          req("/api/owner", cookie, undefined, { "x-lisi-background": "1" }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await pool.query("SELECT updated_at FROM owner_session")).rows[0]
        .updated_at,
    ).toEqual(old);
    await pool.query(
      "UPDATE owner_session SET updated_at=now()-interval '16 minutes'",
    );
    await denied(cookie);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM owner_session")).rows[0]
        .n,
    ).toBe(0);
  });
  it("invalidates a replayed logout cookie while leaving another owner session valid", async () => {
    const first = await login(),
      second = await login();
    const response = await authenticate(req("/api/auth/sign-out", first, {}));
    expect(response.status).toBe(200);
    await denied(first);
    expect((await owner(req("/api/owner", second))).status).toBe(200);
  });
  it("reports logout persistence failure instead of falsely confirming revocation", async () => {
    const cookie = await login();
    await pool.query(
      "CREATE FUNCTION test_block_owner_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test database deletion failure'; END $$",
    );
    try {
      await pool.query(
        "CREATE TRIGGER test_block_owner_delete BEFORE DELETE ON owner_session FOR EACH ROW EXECUTE FUNCTION test_block_owner_delete()",
      );
      const response = await authenticate(
        req("/api/auth/sign-out", cookie, {}),
      );
      expect(response.status).toBe(503);
      expect(response.headers.getSetCookie()).toHaveLength(0);
      expect(
        (await pool.query("SELECT count(*)::int AS n FROM owner_session"))
          .rows[0].n,
      ).toBe(1);
    } finally {
      await pool.query(
        "DROP TRIGGER IF EXISTS test_block_owner_delete ON owner_session",
      );
      await pool.query("DROP FUNCTION test_block_owner_delete()");
    }
    expect(
      (await authenticate(req("/api/auth/sign-out", cookie, {}))).status,
    ).toBe(200);
    await denied(cookie);
  });
  it("enforces durable failure throttling despite spoofed client IPs and shorter-window expiry", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (
          await authenticate(
            req(
              "/api/auth/sign-in/email",
              "",
              { email, password: "incorrect-password" },
              { "x-forwarded-for": `203.0.113.${i}` },
            ),
          )
        ).status,
      ).toBe(401);
    await pool.query("DELETE FROM throttle WHERE key='owner-login'");
    await pool.query("TRUNCATE auth_rate_limit");
    expect(
      (
        await authenticate(
          req("/api/auth/sign-in/email", "", { email, password }),
        )
      ).status,
    ).toBe(429);
    const fresh = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      expect(
        (
          await fresh.query(
            "SELECT count FROM throttle WHERE key='owner-login-failures'",
          )
        ).rows[0].count,
      ).toBe(11);
    } finally {
      await fresh.end();
    }
  });
  it("successful login does not erase prior failed attempts or reveal whether email exists", async () => {
    const known = await authenticate(
      req("/api/auth/sign-in/email", "", { email, password: "wrong-password" }),
    );
    const unknown = await authenticate(
      req("/api/auth/sign-in/email", "", {
        email: "nobody@test.local",
        password: "wrong-password",
      }),
    );
    expect(known.status).toBe(401);
    expect(await unknown.json()).toEqual(await known.json());
    await login();
    expect(
      (
        await pool.query(
          "SELECT count FROM throttle WHERE key='owner-login-failures'",
        )
      ).rows[0].count,
    ).toBe(2);
  });
  it("rejects cross-site writes, misleading content types and forged auth fields", async () => {
    const cookie = await login();
    for (const route of writes)
      expect(
        (
          await route(
            req("/api/owner", cookie, {}, { origin: "https://evil.example" }),
          )
        ).status,
      ).toBe(403);
    for (const type of [
      "text/plain",
      "application/jsonp",
      "application/json-malformed",
    ])
      expect(
        (
          await authenticate(
            req(
              "/api/auth/sign-in/email",
              "",
              { email, password },
              { "content-type": type },
            ),
          )
        ).status,
      ).toBe(415);
    for (const extra of [
      { role: "owner" },
      { ownerId: "owner" },
      { callbackURL: "https://evil.example" },
      { rememberMe: false },
    ])
      expect(
        (
          await authenticate(
            req("/api/auth/sign-in/email", "", { email, password, ...extra }),
          )
        ).status,
      ).toBe(400);
    for (const path of [
      "sign-up/email",
      "update-user",
      "change-password",
      "reset-password",
      "revoke-sessions",
    ])
      expect(
        (await authenticate(req("/api/auth/" + path, cookie, {}))).status,
      ).toBe(404);
  });
});
