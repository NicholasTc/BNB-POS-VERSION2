import { beforeAll, beforeEach, afterEach, afterAll, it, expect, vi } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { db, pool } from "../../src/db";
import { GET, POST } from "../../src/app/api/admin/logs/route";
import { POST as ingest } from "../../src/app/api/diagnostics/route";
import { POST as loginAdmin } from "../../src/app/api/admin/session/route";
import { POST as loginOwner } from "../../src/app/api/auth/[...all]/route";
import { endpoint } from "../../src/lib/http";
import { pairDevice, saveEmployee, attendanceAction } from "../../src/modules/attendance";
import { diagnosticEvent } from "../../src/modules/diagnostics/safe";
import { persistDiagnostics, pruneDiagnostics } from "../../src/modules/diagnostics/store";
import { closeDiagnostics, flushDiagnostics } from "../../src/modules/diagnostics/record";
const origin = "http://127.0.0.1:3100";
const password = "diagnostic-test-password-2026";
let hash: string;
const req = (path: string, cookie = "", payload?: unknown, extra = {}) => new Request(origin + path, { method: payload === undefined ? "GET" : "POST", headers: { cookie, origin, "content-type": "application/json", ...extra }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
const cookies = (response: Response) => response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
async function login(role: "admin" | "owner") {
  const response = await (role === "admin" ? loginAdmin : loginOwner)(req(role === "admin" ? "/api/admin/session" : "/api/auth/sign-in/email", "", { email: role + "@test.local", password }));
  expect(response.status).toBe(200);
  return cookies(response);
}
const event = (patch = {}) => diagnosticEvent({ kind: "request_failed", source: "server", path: "/api/sales", method: "POST", status: 503, error: Object.assign(new Error("DO_NOT_STORE password PIN 0123"), { code: "40P01", stack: "Error\n at src/modules/sales.ts:42:3" }), ...patch }, randomUUID(), new Date(), "a".repeat(40));
beforeAll(async () => { await migrate(db, { migrationsFolder: "drizzle" }); hash = await hashPassword(password); });
beforeEach(async () => {
  process.env.DIAGNOSTICS_ENABLED = "false";
  await closeDiagnostics();
  await pool.query("TRUNCATE diagnostic_issue,owner_user,employee,device,menu_item,throttle,auth_rate_limit CASCADE");
  for (const id of ["owner", "admin"]) {
    await pool.query("INSERT INTO owner_user(id,name,email,role) VALUES($1,$1,$2,$1)", [id,id + "@test.local"]);
    await pool.query("INSERT INTO owner_account(id,account_id,provider_id,user_id,password) VALUES($1,$1,'credential',$1,$2)", [id,hash]);
  }
});
afterEach(async () => { await closeDiagnostics(); process.env.DIAGNOSTICS_ENABLED = "false"; vi.restoreAllMocks(); });
afterAll(async () => { await pool.end(); });

it("denies anonymous, owner, paired/active employees and forged roles on list, detail, export and resolution", async () => {
  const sample = event(); await persistDiagnostics(pool, [sample]);
  const id = (await pool.query("SELECT id FROM diagnostic_issue")).rows[0].id;
  await saveEmployee({ name: "Ayu", pin: "0123", active: true });
  const token = await pairDevice(); await attendanceAction(token, "clock-in", "0123");
  for (const cookie of ["", await login("owner"), "lisi_device=" + token, "better-auth.session_token=forged.admin.signature"]) {
    for (const suffix of ["", "?id=" + id, "?id=" + id + "&download=yes"])
      expect((await GET(req("/api/admin/logs" + suffix, cookie, undefined, { "x-role": "admin" }))).status).toBe(401);
    expect((await POST(req("/api/admin/logs", cookie, { action: "resolve", id, revision: 1 }))).status).toBe(401);
  }
  expect((await pool.query("SELECT state FROM diagnostic_issue")).rows[0].state).toBe("open");
});

it("deduplicates references, groups repeated errors, provides readable sanitized private exports and preserves source rows", async () => {
  const cookie = await login("admin");
  const original = (await pool.query("SELECT (SELECT count(*) FROM sale) sales,(SELECT count(*) FROM attendance) shifts,(SELECT count(*) FROM audit) audits")).rows;
  const one = event(), two = event();
  await persistDiagnostics(pool, [one, one, two]);
  const response = await GET(req("/api/admin/logs?reference=" + one.id, cookie, undefined, { "x-lisi-background": "1" }));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  const feed = await response.json(); expect(feed.items).toHaveLength(1); expect(feed.items[0].occurrences).toBe(2);
  const exported = await GET(req("/api/admin/logs?id=" + feed.items[0].id + "&download=yes", cookie));
  expect(exported.headers.get("content-disposition")).toContain("attachment;");
  const text = await exported.text();
  for (const secret of ["DO_NOT_STORE", "0123", password, "pin_hash", "password", "@test.local"]) expect(text).not.toContain(secret);
  const report = JSON.parse(text); expect(report.explanation.title).toBe("A server request failed"); expect(report.technicalHint).toContain("deadlock"); expect(report.events).toHaveLength(2);
  expect((await pool.query("SELECT (SELECT count(*) FROM sale) sales,(SELECT count(*) FROM attendance) shifts,(SELECT count(*) FROM audit) audits")).rows).toEqual(original);
});

it("resolves an inspected revision, rejects stale resolution and reopens only on a new occurrence", async () => {
  const cookie = await login("admin"); const one = event();
  await persistDiagnostics(pool, [one]);
  const issue = (await pool.query("SELECT id,revision FROM diagnostic_issue")).rows[0];
  expect((await POST(req("/api/admin/logs", cookie, { action: "resolve", ...issue }))).status).toBe(200);
  await persistDiagnostics(pool, [one]);
  expect((await pool.query("SELECT state FROM diagnostic_issue")).rows[0].state).toBe("resolved");
  await persistDiagnostics(pool, [event()]);
  expect((await pool.query("SELECT state FROM diagnostic_issue")).rows[0].state).toBe("open");
  expect((await POST(req("/api/admin/logs", cookie, { action: "resolve", ...issue }))).status).toBe(409);
});

it("bounds and validates filters, bodies, origin, sample count and stable pagination", async () => {
  const cookie = await login("admin");
  for (let i = 0; i < 27; i++) await persistDiagnostics(pool, [event({ frames: [`src/lib/client.ts:${i + 1}:1`] })]);
  const first = await (await GET(req("/api/admin/logs", cookie))).json();
  expect(first.items).toHaveLength(25); expect(first.hasMore).toBe(true);
  const second = await (await GET(req("/api/admin/logs?page=2", cookie))).json();
  expect(second.items).toHaveLength(2); expect(second.hasMore).toBe(false);
  expect(new Set([...first.items,...second.items].map(i => i.id)).size).toBe(27);
  for (const suffix of ["?page=0", "?page=401", "?days=31", "?source=sql", "?state=open&state=resolved", "?reference=invalid", "?ownerId=owner", "?download=yes"])
    expect((await GET(req("/api/admin/logs" + suffix, cookie))).status).toBe(400);
  expect((await POST(req("/api/admin/logs", cookie, { action: "resolve", id: first.items[0].id, revision: 1 }, { origin: "https://evil.example" }))).status).toBe(403);
});

it("authenticates and bounds untrusted browser reports without extending owner inactivity or storing submitted credentials", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const payload = { id: randomUUID(), kind: "browser_request", path: "/api/sales?password=DO_NOT_STORE", frames: ["https://evil.example/secret?token=DO_NOT_STORE:1:2"] };
  expect((await ingest(req("/api/diagnostics", "", payload, { "x-role": "admin" }))).status).toBe(401);
  const cookie = await login("owner");
  await pool.query("UPDATE owner_session SET updated_at=now()-interval '14 minutes'");
  const before = (await pool.query("SELECT updated_at FROM owner_session")).rows[0].updated_at;
  process.env.DIAGNOSTICS_ENABLED = "true";
  expect((await ingest(req("/api/diagnostics", cookie, payload))).status).toBe(202);
  await flushDiagnostics();
  expect((await pool.query("SELECT updated_at FROM owner_session")).rows[0].updated_at).toEqual(before);
  expect((await pool.query("SELECT source,path FROM diagnostic_issue")).rows).toEqual([{ source: "browser", path: "/api/sales" }]);
  expect(JSON.stringify((await pool.query("SELECT * FROM diagnostic_event")).rows)).not.toContain("DO_NOT_STORE");
  expect((await ingest(req("/api/diagnostics", cookie, { ...payload, role: "admin" }))).status).toBe(400);
  expect((await ingest(req("/api/diagnostics", cookie, payload, { origin: "https://evil.example" }))).status).toBe(403);
  for (let i = 0; i < 11; i++) expect((await ingest(req("/api/diagnostics", cookie, { ...payload, id: randomUUID() }))).status).toBe(202);
  expect((await ingest(req("/api/diagnostics", cookie, payload))).status).toBe(429);
});

it("records unexpected API failures with a reference and does not recurse or block when diagnostic storage fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.DIAGNOSTICS_ENABLED = "true";
  const handler = endpoint(async () => { throw Object.assign(new Error("DO_NOT_STORE password 0123"), { code: "40P01" }); });
  const response = await handler(req("/api/sales?secret=DO_NOT_STORE"));
  const result = await response.json(); expect(response.status).toBe(503); expect(result.reference).toMatch(/^[a-f0-9-]{36}$/);
  await flushDiagnostics();
  expect((await pool.query("SELECT id FROM diagnostic_event WHERE id=$1", [result.reference])).rowCount).toBe(1);
  await pool.query("ALTER TABLE diagnostic_event RENAME TO diagnostic_event_test_unavailable");
  try {
    const next = await handler(req("/api/sales")); expect(next.status).toBe(503);
    await expect(flushDiagnostics()).resolves.toBeUndefined();
    const viewer = await GET(req("/api/admin/logs", await login("admin")));
    expect(viewer.status).toBe(503);
    await flushDiagnostics();
  } finally { await pool.query("ALTER TABLE diagnostic_event_test_unavailable RENAME TO diagnostic_event"); }
  const output = JSON.stringify(vi.mocked(console.error).mock.calls);
  expect(output).not.toContain("DO_NOT_STORE"); expect(output).not.toContain("0123");
});

it("expires old references and inactive groups while keeping recent evidence and all business records", async () => {
  const recent = event(); const old = { ...event({ kind: "database_connection" }), at: new Date(Date.now() - 31 * 86400000).toISOString() };
  await persistDiagnostics(pool, [old,recent]); await pruneDiagnostics(pool);
  expect((await pool.query("SELECT id FROM diagnostic_event")).rows).toEqual([{ id: recent.id }]);
  expect((await pool.query("SELECT count(*)::int n FROM diagnostic_issue")).rows[0].n).toBe(1);
  expect((await pool.query("SELECT count(*)::int n FROM owner_user")).rows[0].n).toBe(2);
});
