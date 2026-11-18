import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../../src/db";
import { user, account, menuItem } from "../../src/db/schema";
import {
  GET as admin,
  POST as loginAdmin,
  DELETE as logoutAdmin,
} from "../../src/app/api/admin/session/route";
import {
  GET as owners,
  POST as createOwner,
} from "../../src/app/api/admin/owners/route";
import {
  GET as staff,
  POST as saveStaff,
} from "../../src/app/api/admin/employees/route";
import { POST as loginOwner } from "../../src/app/api/auth/[...all]/route";
import { GET as owner } from "../../src/app/api/owner/route";
import { GET as report } from "../../src/app/api/owner/report/route";
import {
  GET as employees,
  POST as ownerStaff,
} from "../../src/app/api/owner/employees/route";
import { POST as preferences } from "../../src/app/api/owner/preferences/route";
import { GET as menu } from "../../src/app/api/owner/menu/route";
import { GET as stock } from "../../src/app/api/owner/stock/route";
import { GET as alerts } from "../../src/app/api/owner/alerts/route";
import { GET as sheets } from "../../src/app/api/owner/sheets/route";
import { GET as promos } from "../../src/app/api/owner/promos/route";
import {
  pairDevice,
  attendanceAction,
  posState,
  saveEmployee,
  DEVICE_COOKIE,
} from "../../src/modules/attendance";
import { prepareSale, changeSale } from "../../src/modules/sales";
import { provisionIdentity } from "../../src/modules/account-manager/provision";
const origin = "http://127.0.0.1:3100",
  adminPassword = "administrator-test-2026",
  ownerPassword = "test-owner-password-2026";
let adminHash: string, ownerHash: string;
const request = (
  path: string,
  cookie = "",
  payload?: unknown,
  extra: Record<string, string> = {},
) =>
  new Request(origin + path, {
    method: payload === undefined ? "GET" : "POST",
    headers: { origin, cookie, "content-type": "application/json", ...extra },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
async function login(role: "admin" | "owner" | "partner" = "admin") {
  const response = await (role === "admin" ? loginAdmin : loginOwner)(
    request(
      role === "admin" ? "/api/admin/session" : "/api/auth/sign-in/email",
      "",
      {
        email: role + "@test.local",
        password: role === "admin" ? adminPassword : ownerPassword,
      },
    ),
  );
  expect(response.status).toBe(200);
  return cookies(response);
}
const creation = (patch = {}) => ({
  operationId: randomUUID(),
  name: "Partner Three",
  email: "third@test.local",
  password: "new-partner-password-2026",
  adminPassword,
  ...patch,
});
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  adminHash = await hashPassword(adminPassword);
  ownerHash = await hashPassword(ownerPassword);
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE owner_user,employee,device,menu_item,throttle,auth_rate_limit CASCADE",
  );
  for (const id of ["admin", "owner", "partner"]) {
    await db
      .insert(user)
      .values({
        id,
        name: id,
        email: id + "@test.local",
        role: id === "admin" ? "admin" : "owner",
      });
    await db
      .insert(account)
      .values({
        id,
        accountId: id,
        userId: id,
        providerId: "credential",
        password: id === "admin" ? adminHash : ownerHash,
      });
  }
});
afterAll(async () => {
  await pool.end();
});
it("requires the right role for each login portal and never sends wrong-role session cookies", async () => {
  const asAdmin = await loginAdmin(
    request("/api/admin/session", "", {
      email: "owner@test.local",
      password: ownerPassword,
    }),
  );
  const asOwner = await loginOwner(
    request("/api/auth/sign-in/email", "", {
      email: "admin@test.local",
      password: adminPassword,
    }),
  );
  expect([asAdmin.status, asOwner.status]).toEqual([401, 401]);
  expect(cookies(asAdmin)).toBe("");
  expect(cookies(asOwner)).toBe("");
  expect(
    (await pool.query("SELECT count(*) n FROM owner_session")).rows[0].n,
  ).toBe("0");
  expect(
    (await admin(request("/api/admin/session", await login()))).status,
  ).toBe(200);
  expect(
    (await owner(request("/api/owner", await login("partner")))).status,
  ).toBe(200);
});
it("rejects owners, active employees and forged administrator headers on every admin operation", async () => {
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  const token = await pairDevice();
  await attendanceAction(token, "clock-in", "0123");
  for (const cookie of [
    "",
    await login("owner"),
    await login("partner"),
    `${DEVICE_COOKIE}=${token}`,
    "better-auth.session_token=forged.admin.signature",
  ]) {
    const headers = {
      "x-role": "admin",
      "x-user-id": "admin",
      authorization: "Bearer 0123",
    };
    for (const route of [admin, owners, staff])
      expect(
        (await route(request("/api/admin", cookie, undefined, headers))).status,
      ).toBe(401);
    for (const route of [createOwner, saveStaff])
      expect(
        (await route(request("/api/admin", cookie, {}, headers))).status,
      ).toBe(401);
  }
});
it("admin sessions cannot access owner reports or management APIs", async () => {
  const cookie = await login();
  for (const route of [
    owner,
    report,
    employees,
    menu,
    stock,
    alerts,
    sheets,
    promos,
  ])
    expect((await route(request("/api/owner", cookie))).status).toBe(401);
  expect(
    (
      await ownerStaff(
        request("/api/owner/employees", cookie, {
          name: "Bad",
          pin: "9999",
          active: true,
        }),
      )
    ).status,
  ).toBe(401);
  expect((await staff(request("/api/admin/employees", cookie))).status).toBe(
    200,
  );
});
it("creates a hashed owner once under concurrent retries without changing existing credentials or business data", async () => {
  const cookie = await login(),
    input = creation();
  const before = (
    await pool.query("SELECT id,password FROM owner_account ORDER BY id")
  ).rows;
  const result = await Promise.all([
    createOwner(request("/api/admin/owners", cookie, input)),
    createOwner(request("/api/admin/owners", cookie, input)),
  ]);
  expect(result.map((r) => r.status)).toEqual([200, 200]);
  const bodies = await Promise.all(result.map((r) => r.json()));
  expect(bodies[0].id).toBe(bodies[1].id);
  expect(bodies.map((b) => b.replayed).sort()).toEqual([false, true]);
  const saved = (
    await pool.query(
      "SELECT u.role,a.password FROM owner_user u JOIN owner_account a ON a.user_id=u.id WHERE u.email=$1",
      [input.email],
    )
  ).rows[0];
  expect(saved.role).toBe("owner");
  expect(saved.password).not.toBe(input.password);
  expect(
    await verifyPassword({ hash: saved.password, password: input.password }),
  ).toBe(true);
  expect(
    (
      await pool.query(
        "SELECT id,password FROM owner_account WHERE user_id IN ('admin','owner','partner') ORDER BY id",
      )
    ).rows,
  ).toEqual(before);
  expect(
    (await pool.query("SELECT count(*) n FROM owner_creation")).rows[0].n,
  ).toBe("1");
  expect(
    (
      await pool.query(
        "SELECT count(*) n FROM audit WHERE action='admin.owner.create' AND details->>'operationId'=$1",
        [input.operationId],
      )
    ).rows[0].n,
  ).toBe("1");
  expect(
    (
      await createOwner(
        request("/api/admin/owners", cookie, {
          ...input,
          password: "changed-password-2026",
        }),
      )
    ).status,
  ).toBe(409);
  for (const table of ["sale", "attendance", "stock_movement", "menu_item"])
    expect(
      (await pool.query(`SELECT count(*) n FROM ${table}`)).rows[0].n,
    ).toBe("0");
});
it("requires a fresh administrator password, exact origin and strict payload; rejects duplicate emails ignoring case", async () => {
  const cookie = await login();
  expect(
    (
      await createOwner(
        request(
          "/api/admin/owners",
          cookie,
          creation({ adminPassword: "incorrect" }),
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await createOwner(
        request("/api/admin/owners", cookie, creation(), {
          origin: "https://evil.test",
        }),
      )
    ).status,
  ).toBe(403);
  for (const patch of [
    { role: "admin" },
    { cafeId: "other" },
    { password: "1234" },
  ])
    expect(
      (await createOwner(request("/api/admin/owners", cookie, creation(patch))))
        .status,
    ).toBe(400);
  expect(
    (
      await createOwner(
        request(
          "/api/admin/owners",
          cookie,
          creation({ email: " OWNER@test.local " }),
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (await pool.query("SELECT count(*) n FROM owner_user")).rows[0].n,
  ).toBe("3");
});
it("rolls back credentials and user together when recording creation fails", async () => {
  const cookie = await login(),
    input = creation();
  await pool.query(
    "CREATE FUNCTION fail_owner_creation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER fail_owner_creation BEFORE INSERT ON owner_creation FOR EACH ROW EXECUTE FUNCTION fail_owner_creation()",
  );
  try {
    expect(
      (await createOwner(request("/api/admin/owners", cookie, input))).status,
    ).toBe(503);
    expect(
      (
        await pool.query("SELECT count(*) n FROM owner_user WHERE email=$1", [
          input.email,
        ])
      ).rows[0].n,
    ).toBe("0");
    expect(
      (await pool.query("SELECT count(*) n FROM owner_account")).rows[0].n,
    ).toBe("3");
  } finally {
    await pool.query(
      "DROP TRIGGER fail_owner_creation ON owner_creation; DROP FUNCTION fail_owner_creation()",
    );
  }
});
it("lists all owners with bounded pagination and never exposes passwords, receipt hashes or administrator identity", async () => {
  const cookie = await login();
  await db
    .insert(user)
    .values(
      Array.from({ length: 27 }, (_, i) => ({
        id: randomUUID(),
        name: `Owner ${i}`,
        email: `owner${i}@test.local`,
      })),
    );
  const first = await owners(request("/api/admin/owners", cookie)),
    text = await first.text(),
    data = JSON.parse(text);
  expect(data.total).toBe(29);
  expect(data.owners).toHaveLength(25);
  const second = await (
    await owners(request("/api/admin/owners?page=2", cookie))
  ).json();
  expect(second.owners).toHaveLength(4);
  expect(
    new Set([...data.owners, ...second.owners].map((o) => o.id)).size,
  ).toBe(29);
  for (const value of [
    "admin@test.local",
    "password",
    adminHash,
    ownerHash,
    "requestHash",
  ])
    expect(text).not.toContain(value);
  for (const query of ["?page=0", "?page=1&page=2", "?role=admin", "?page=NaN"])
    expect(
      (await owners(request("/api/admin/owners" + query, cookie))).status,
    ).toBe(400);
});
it("shares staff records and PIN protections between admin and both owners", async () => {
  const adminCookie = await login(),
    ownerCookie = await login("owner"),
    partnerCookie = await login("partner");
  expect(
    (
      await saveStaff(
        request("/api/admin/employees", adminCookie, {
          name: "Ayu",
          pin: "0123",
          active: true,
        }),
      )
    ).status,
  ).toBe(200);
  const listing = await (
    await staff(request("/api/admin/employees", adminCookie))
  ).json();
  expect(listing).toEqual(
    await (
      await employees(request("/api/owner/employees", ownerCookie))
    ).json(),
  );
  expect(listing).toEqual(
    await (
      await employees(request("/api/owner/employees", partnerCookie))
    ).json(),
  );
  expect(Object.keys(listing[0]).sort()).toEqual(["active", "id", "name"]);
  expect(
    (
      await saveStaff(
        request("/api/admin/employees", adminCookie, {
          name: "Duplicate",
          pin: "0123",
          active: true,
        }),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await ownerStaff(
        request("/api/owner/employees", partnerCookie, {
          id: listing[0].id,
          name: "Ayu",
          pin: "4567",
          active: true,
        }),
      )
    ).status,
  ).toBe(200);
  const token = await pairDevice();
  await expect(attendanceAction(token, "clock-in", "0123")).rejects.toThrow();
  await attendanceAction(token, "clock-in", "4567");
  expect(
    (
      await saveStaff(
        request("/api/admin/employees", adminCookie, {
          id: listing[0].id,
          name: "Ayu",
          active: false,
        }),
      )
    ).status,
  ).toBe(409);
});
it("both owners see identical completed revenue while language preferences remain independent", async () => {
  const primary = await login("owner"),
    partner = await login("partner");
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  const token = await pairDevice();
  await attendanceAction(token, "clock-in", "0123");
  const [product] = await db
    .insert(menuItem)
    .values({ name: "Juice", price: 20000 })
    .returning();
  const id = randomUUID();
  await prepareSale(token, {
    id,
    generation: (await posState(token)).generation,
    paymentMethod: "cash",
    items: [{ id: product.id, quantity: 2, unitPrice: 20000 }],
  });
  await changeSale(token, { id, action: "attest", paymentReceived: true });
  await changeSale(token, { id, action: "complete" });
  const a = await (await report(request("/api/owner/report", primary))).json(),
    b = await (await report(request("/api/owner/report", partner))).json();
  expect(a).toEqual(b);
  expect(JSON.stringify(a)).toContain("40000");
  expect(
    (
      await preferences(
        request("/api/owner/preferences", partner, { language: "en" }),
      )
    ).status,
  ).toBe(200);
  expect(
    (await (await owner(request("/api/owner", primary))).json()).language,
  ).toBe("id");
  expect(
    (await (await owner(request("/api/owner", partner))).json()).language,
  ).toBe("en");
});
it("passive checks do not extend idle time; expired, absolute-age and revoked admin sessions fail closed", async () => {
  for (const condition of [
    "updated_at=now()-interval '16 minutes'",
    "created_at=now()-interval '9 hours',expires_at=now()+interval '1 hour'",
    "expires_at=now()-interval '1 second'",
  ]) {
    const cookie = await login();
    const before = (
      await pool.query(
        "SELECT updated_at FROM owner_session WHERE user_id='admin' ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0].updated_at;
    expect(
      (
        await admin(
          request("/api/admin/session", cookie, undefined, {
            "x-lisi-background": "1",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT updated_at FROM owner_session WHERE user_id='admin' ORDER BY created_at DESC LIMIT 1",
        )
      ).rows[0].updated_at,
    ).toEqual(before);
    await pool.query(
      "UPDATE owner_session SET " + condition + " WHERE user_id='admin'",
    );
    expect((await admin(request("/api/admin/session", cookie))).status).toBe(
      401,
    );
    expect(
      (await createOwner(request("/api/admin/owners", cookie, creation())))
        .status,
    ).toBe(401);
  }
  const cookie = await login();
  const response = await logoutAdmin(
    new Request(origin + "/api/admin/session", {
      method: "DELETE",
      headers: { origin, cookie, "content-type": "application/json" },
      body: "{}",
    }),
  );
  expect(response.status).toBe(200);
  expect((await admin(request("/api/admin/session", cookie))).status).toBe(401);
});
it("terminal resets revoke only the selected identity and preserve partner and administrator access", async () => {
  const a = await login(),
    o = await login("owner"),
    p = await login("partner");
  await expect(
    provisionIdentity("admin", {
      email: "admin@test.local",
      password: adminPassword,
      reset: false,
    }),
  ).rejects.toThrow("Explicit reset");
  await provisionIdentity("owner", {
    email: "owner@test.local",
    password: "replacement-owner-2026",
    reset: true,
  });
  expect((await owner(request("/api/owner", o))).status).toBe(401);
  expect((await owner(request("/api/owner", p))).status).toBe(200);
  expect((await admin(request("/api/admin/session", a))).status).toBe(200);
  await provisionIdentity("admin", {
    email: "admin@test.local",
    password: adminPassword,
    reset: true,
  });
  expect((await admin(request("/api/admin/session", a))).status).toBe(401);
  expect((await owner(request("/api/owner", p))).status).toBe(200);
});
it("limits incorrect admin logins and fresh-password attempts in the database", async () => {
  const cookie = await login();
  for (let i = 0; i < 5; i++)
    expect(
      (
        await createOwner(
          request(
            "/api/admin/owners",
            cookie,
            creation({ adminPassword: "wrong" }),
          ),
        )
      ).status,
    ).toBe(403);
  expect(
    (await createOwner(request("/api/admin/owners", cookie, creation())))
      .status,
  ).toBe(429);
  for (let i = 0; i < 9; i++)
    expect(
      (
        await loginAdmin(
          request("/api/admin/session", "", {
            email: "admin@test.local",
            password: "wrong",
          }),
        )
      ).status,
    ).toBe(401);
  expect(
    (
      await loginAdmin(
        request("/api/admin/session", "", {
          email: "admin@test.local",
          password: adminPassword,
        }),
      )
    ).status,
  ).toBe(429);
});
