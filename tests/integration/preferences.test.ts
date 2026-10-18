import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { db, pool } from "../../src/db";
import { user, account, ownerPreferences, session } from "../../src/db/schema";
import { auth } from "../../src/lib/auth";
import { GET } from "../../src/app/api/owner/route";
import { POST } from "../../src/app/api/owner/preferences/route";
import {
  POST as saveMenuRoute,
  GET as menuRoute,
} from "../../src/app/api/owner/menu/route";
import { saveMenu } from "../../src/modules/sales";
const origin = "http://127.0.0.1:3100";
let cookie: string;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await pool.query("TRUNCATE owner_user,throttle,auth_rate_limit CASCADE");
  await db
    .insert(user)
    .values({ id: "owner", name: "Pemilik", email: "owner@test.local" });
  await db.insert(account).values({
    id: "preferences",
    accountId: "owner",
    userId: "owner",
    providerId: "credential",
    password: await hashPassword("test-owner-password-2026"),
  });
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
  cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
});
afterAll(async () => {
  await pool.end();
});
const request = (body: unknown, token = cookie, source = origin) =>
  new Request(origin + "/api/owner/preferences", {
    method: "POST",
    headers: {
      cookie: token,
      origin: source,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
describe("persistent owner preference", () => {
  it("defaults to Indonesian without changing existing owner rows", async () => {
    const response = await GET(
      new Request(origin + "/api/owner", { headers: { cookie } }),
    );
    expect(await response.json()).toEqual({ name: "Pemilik", language: "id" });
  });
  it("requires owner authorization and exact origin", async () => {
    expect((await POST(request({ language: "en" }, ""))).status).toBe(401);
    expect(
      (await POST(request({ language: "en" }, cookie, "https://evil.example")))
        .status,
    ).toBe(403);
    expect(await db.select().from(ownerPreferences)).toHaveLength(0);
  });
  it("rejects unsupported language and forged owner identity", async () => {
    expect((await POST(request({ language: "fr" }))).status).toBe(400);
    expect(
      (await POST(request({ language: "en", ownerId: "other" }))).status,
    ).toBe(400);
  });
  it("persists across connections, updates in place and returns in owner session API", async () => {
    expect((await POST(request({ language: "en" }))).status).toBe(200);
    const fresh = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const r = await fresh.query(
        "SELECT language FROM owner_preferences WHERE owner_id='owner'",
      );
      expect(r.rows).toEqual([{ language: "en" }]);
    } finally {
      await fresh.end();
    }
    expect(
      (
        await (
          await GET(new Request(origin + "/api/owner", { headers: { cookie } }))
        ).json()
      ).language,
    ).toBe("en");
    expect((await POST(request({ language: "id" }))).status).toBe(200);
    expect(await db.select().from(ownerPreferences)).toHaveLength(1);
  });
  it("requires owner/origin for menu metadata and rejects unsafe photos/categories", async () => {
    const input = {
      name: "Metadata test",
      price: 12000,
      active: true,
      category: "drink",
      imageUrl: "/menu/mango.webp",
    };
    expect((await saveMenuRoute(request(input, ""))).status).toBe(401);
    expect(
      (await saveMenuRoute(request(input, cookie, "https://evil.example")))
        .status,
    ).toBe(403);
    for (const invalid of [
      { category: "other" },
      { imageUrl: "javascript:alert(1)" },
      { imageUrl: "//evil.example/photo" },
    ]) {
      expect(
        (await saveMenuRoute(request({ ...input, ...invalid }))).status,
      ).toBe(400);
    }
  });
  it("persists category/photo and legacy edits preserve those fields", async () => {
    const input = {
      name: "Photo test",
      price: 12000,
      active: true,
      category: "food",
      imageUrl: "/menu/pastry.webp",
    };
    expect((await saveMenuRoute(request(input))).status).toBe(200);
    const saved = await pool.query(
      "SELECT id,category,image_url FROM menu_item WHERE name='Photo test'",
    );
    expect(saved.rows[0]).toMatchObject({
      category: "food",
      image_url: "/menu/pastry.webp",
    });
    await saveMenu({
      id: saved.rows[0].id,
      name: "Photo test updated",
      price: 13000,
      active: true,
    });
    const response = await menuRoute(
      new Request(origin + "/api/owner/menu", { headers: { cookie } }),
    );
    expect(
      (await response.json()).find(
        (i: { id: string }) => i.id === saved.rows[0].id,
      ),
    ).toMatchObject({
      category: "food",
      imageUrl: "/menu/pastry.webp",
      price: 13000,
    });
  });
  it("keeps old products valid with neutral defaults and constrains metadata in PostgreSQL", async () => {
    const result = await pool.query(
      "INSERT INTO menu_item (name,price) VALUES ('Legacy item',1000) RETURNING id,category,image_url",
    );
    expect(result.rows[0]).toMatchObject({
      category: "uncategorized",
      image_url: "",
    });
    await expect(
      pool.query("UPDATE menu_item SET category='invalid' WHERE id=$1", [
        result.rows[0].id,
      ]),
    ).rejects.toThrow();
  });
  it("background reads validate but never extend the owner session", async () => {
    const expires = new Date(Date.now() + 30 * 60000);
    await db.update(session).set({ expiresAt: expires });
    expect(
      (
        await GET(
          new Request(origin + "/api/owner", {
            headers: { cookie, "x-lisi-background": "1" },
          }),
        )
      ).status,
    ).toBe(200);
    expect((await db.select().from(session))[0].expiresAt.getTime()).toBe(
      expires.getTime(),
    );
    await db.update(session).set({ expiresAt: new Date(0) });
    expect(
      (
        await GET(
          new Request(origin + "/api/owner", {
            headers: { cookie, "x-lisi-background": "1" },
          }),
        )
      ).status,
    ).toBe(401);
  });
});
