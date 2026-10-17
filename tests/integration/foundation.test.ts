import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword } from "better-auth/crypto";
import { db, pool } from "../../src/db";
import { user, account } from "../../src/db/schema";
import { auth } from "../../src/lib/auth";
import { GET as ownerGet } from "../../src/app/api/owner/route";
import { POST as authPost } from "../../src/app/api/auth/[...all]/route";
import { limit } from "../../src/lib/http";
const origin = "http://127.0.0.1:3100";
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await migrate(db, { migrationsFolder: "drizzle" });
  await pool.query("TRUNCATE owner_user, throttle CASCADE");
  await db
    .insert(user)
    .values({ id: "owner", email: "owner@test.local", name: "Pemilik" });
  await db
    .insert(account)
    .values({
      id: "credential",
      accountId: "owner",
      userId: "owner",
      providerId: "credential",
      password: await hashPassword("test-owner-password-2026"),
    });
});
afterAll(async () => {
  await pool.end();
});
describe("foundation PostgreSQL/auth", () => {
  it("applies migrations idempotently and enforces one owner", async () => {
    await expect(
      db
        .insert(user)
        .values({ id: "another", name: "Bad", email: "other@test.local" }),
    ).rejects.toThrow();
  });
  it("denies anonymous owner access", async () =>
    expect((await ownerGet(new Request(origin + "/api/owner"))).status).toBe(
      401,
    ));
  it("blocks public signup and cross-site login", async () => {
    const req = (path: string, o: string) =>
      new Request(origin + path, {
        method: "POST",
        headers: { origin: o, "content-type": "application/json" },
        body: "{}",
      });
    expect(
      (await authPost(req("/api/auth/sign-up/email", origin))).status,
    ).toBe(404);
    expect(
      (await authPost(req("/api/auth/sign-in/email", "https://evil.example")))
        .status,
    ).toBe(403);
  });
  it("authenticates, authorizes, and revokes a real session", async () => {
    const response = await auth.handler(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          email: "owner@test.local",
          password: "test-owner-password-2026",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookie).toContain("session_token");
    expect(
      (
        await ownerGet(
          new Request(origin + "/api/owner", { headers: { cookie } }),
        )
      ).status,
    ).toBe(200);
    const logout = await auth.handler(
      new Request(origin + "/api/auth/sign-out", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(logout.status).toBe(200);
    expect(
      (
        await ownerGet(
          new Request(origin + "/api/owner", { headers: { cookie } }),
        )
      ).status,
    ).toBe(401);
  });
  it("atomically limits concurrent attempts in PostgreSQL", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 7 }, () => limit("test-concurrent", 3, 60)),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(3);
  });
});
