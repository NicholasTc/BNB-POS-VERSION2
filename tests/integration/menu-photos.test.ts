import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword } from "better-auth/crypto";
import { db, pool } from "../../src/db";
import { user, account, menuItem } from "../../src/db/schema";
import { POST as authenticate } from "../../src/app/api/auth/[...all]/route";
import { POST as upload } from "../../src/app/api/owner/menu/photos/route";
import { GET as image } from "../../src/app/api/menu-photos/[filename]/route";
import { POST as menu } from "../../src/app/api/owner/menu/route";
import { saveMenu } from "../../src/modules/sales";
import {
  uploadPhoto,
  readPhoto,
  cleanupPhotos,
} from "../../src/modules/menu-photos/server";
import { photoConfig } from "../../src/modules/menu-photos/config";
import {
  photoStore,
  type PhotoStore,
} from "../../src/modules/menu-photos/storage";
import { photoUrl, MAX_PHOTO_UPLOAD_BYTES } from "../../src/lib/menu-photo";
import { pairDevice, DEVICE_COOKIE } from "../../src/modules/attendance";
const origin = "http://127.0.0.1:3100";
let cookie: string,
  picture: Buffer,
  directory: string,
  item: string,
  passwordHash: string;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  directory = await mkdtemp(join(tmpdir(), "lisi-photo-integration-"));
  process.env.MENU_PHOTO_LOCAL_DIR = directory;
  passwordHash = await hashPassword("test-owner-password-2026");
  picture = await sharp({
    create: { width: 40, height: 60, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE menu_photo_asset,owner_user,employee,device,menu_item,throttle,auth_rate_limit CASCADE",
  );
  await db
    .insert(user)
    .values({ id: "owner", email: "owner@test.local", name: "Pemilik" });
  await db.insert(account).values({
    id: "photos",
    accountId: "owner",
    userId: "owner",
    providerId: "credential",
    password: passwordHash,
  });
  const response = await authenticate(
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
  item = (
    await db
      .insert(menuItem)
      .values({ name: "Coffee", price: 20000, imageUrl: "/menu/coffee.webp" })
      .returning()
  )[0].id;
});
afterAll(async () => {
  await pool.end();
  await rm(directory, { recursive: true, force: true });
});
const req = (
  id = randomUUID(),
  cookies = cookie,
  bytes: BodyInit = new Uint8Array(picture),
  extra: Record<string, string> = {},
) =>
  new Request(origin + "/api/owner/menu/photos", {
    method: "POST",
    headers: {
      cookie: cookies,
      origin,
      "content-type": "image/png",
      "x-upload-id": id,
      ...extra,
    },
    body: bytes,
  });
const get = (id: string, cookies = cookie) =>
  image(new Request(origin + photoUrl(id), { headers: { cookie: cookies } }), {
    params: Promise.resolve({ filename: id + ".webp" }),
  });
async function source() {
  const tables = [
    "menu_item",
    "sale",
    "sale_line",
    "sale_discount",
    "attendance",
    "device",
    "stock_item",
    "stock_movement",
    "sheets_sync_job",
    "sheets_sync_row",
  ];
  const result = [];
  for (const table of tables)
    result.push(
      (
        await pool.query(
          `SELECT count(*) n,md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) hash FROM ${table} t`,
        )
      ).rows[0],
    );
  return result;
}
it("stages normalized photos without editing menu or business data, then applies only on owner Save", async () => {
  const before = await source(),
    id = randomUUID(),
    response = await upload(req(id));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ imageUrl: photoUrl(id) });
  expect(await source()).toEqual(before);
  const saved = await menu(
    new Request(origin + "/api/owner/menu", {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({
        id: item,
        name: "Coffee",
        price: 20000,
        active: true,
        imageUrl: photoUrl(id),
        expectedImageUrl: "/menu/coffee.webp",
      }),
    }),
  );
  expect(saved.status).toBe(200);
  expect(
    (await pool.query("SELECT image_url FROM menu_item WHERE id=$1", [item]))
      .rows[0].image_url,
  ).toBe(photoUrl(id));
  const result = await get(id);
  expect(result.status).toBe(200);
  expect(result.headers.get("content-type")).toBe("image/webp");
  expect(result.headers.get("cache-control")).toContain("private");
  expect(
    (await sharp(Buffer.from(await result.arrayBuffer())).metadata()).format,
  ).toBe("webp");
});
it("denies anonymous, employee-device and foreign-origin uploads before creating files", async () => {
  const token = await pairDevice();
  for (const cookies of ["", `${DEVICE_COOKIE}=${token}`])
    expect((await upload(req(randomUUID(), cookies))).status).toBe(401);
  expect(
    (
      await upload(
        req(randomUUID(), cookie, undefined, { origin: "https://evil.test" }),
      )
    ).status,
  ).toBe(403);
  expect(
    (await pool.query("SELECT count(*) n FROM menu_photo_asset")).rows[0].n,
  ).toBe("0");
});
it("validates raw body bounds, signatures and MIME types without trusting content-length", async () => {
  expect(
    (
      await upload(
        req(randomUUID(), cookie, new Uint8Array(Buffer.from("<svg/>"))),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await upload(
        req(randomUUID(), cookie, undefined, {
          "content-type": "image/svg+xml",
        }),
      )
    ).status,
  ).toBe(415);
  expect(
    (
      await upload(
        req(randomUUID(), cookie, new Uint8Array(MAX_PHOTO_UPLOAD_BYTES + 1)),
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await upload(
        req(randomUUID(), cookie, undefined, {
          "content-length": String(MAX_PHOTO_UPLOAD_BYTES + 1),
        }),
      )
    ).status,
  ).toBe(413);
  expect(
    (await pool.query("SELECT count(*) n FROM menu_photo_asset")).rows[0].n,
  ).toBe("0");
});
it("preserves old photos on storage failure and retries an ambiguously applied upload at the same URL", async () => {
  const config = photoConfig(),
    cells = new Map<string, Buffer>(),
    id = randomUUID();
  let fail = true;
  const store: PhotoStore = {
    put: vi.fn(async (key, bytes) => {
      cells.set(key, bytes);
      if (fail) throw new Error("lost reply");
    }),
    get: async (key) => cells.get(key)!,
    remove: async (key) => {
      cells.delete(key);
    },
  };
  await expect(
    uploadPhoto(id, picture, "image/png", config, store),
  ).rejects.toThrow("unavailable");
  expect(
    (await pool.query("SELECT image_url FROM menu_item WHERE id=$1", [item]))
      .rows[0].image_url,
  ).toBe("/menu/coffee.webp");
  expect(
    (await pool.query("SELECT state FROM menu_photo_asset")).rows[0].state,
  ).toBe("pending");
  fail = false;
  expect(await uploadPhoto(id, picture, "image/png", config, store)).toEqual({
    imageUrl: photoUrl(id),
  });
  await uploadPhoto(id, picture, "image/png", config, store);
  expect(store.put).toHaveBeenCalledTimes(2);
  expect(cells.size).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*) n FROM audit WHERE action='menu.photo.upload' AND details->>'photoId'=$1",
        [id],
      )
    ).rows[0].n,
  ).toBe("1");
});
it("refuses forged, missing and deleted photo references and stale owner photo updates", async () => {
  const id = randomUUID();
  await expect(
    saveMenu({
      id: item,
      name: "Coffee",
      price: 20000,
      active: true,
      imageUrl: photoUrl(id),
    }),
  ).rejects.toThrow("Foto belum tersedia");
  await uploadPhoto(id, picture, "image/png");
  await saveMenu({
    id: item,
    name: "Coffee",
    price: 20000,
    active: true,
    imageUrl: origin + photoUrl(id) + "?cache=old#preview",
    expectedImageUrl: "/menu/coffee.webp",
  });
  const next = randomUUID();
  await uploadPhoto(next, picture, "image/png");
  await saveMenu({
    id: item,
    name: "Coffee",
    price: 20000,
    active: true,
    imageUrl: photoUrl(next),
    expectedImageUrl: photoUrl(id),
  });
  await expect(
    saveMenu({
      id: item,
      name: "Stale edit",
      price: 1,
      active: false,
      imageUrl: photoUrl(id),
      expectedImageUrl: "/menu/coffee.webp",
    }),
  ).rejects.toThrow("Foto menu telah berubah");
  expect(
    (
      await pool.query("SELECT name,image_url FROM menu_item WHERE id=$1", [
        item,
      ])
    ).rows[0],
  ).toEqual({ name: "Coffee", image_url: photoUrl(next) });
});
it("serves photos only to authorized owner/device reads without renewing owner or cashier idle times", async () => {
  const id = randomUUID();
  await uploadPhoto(id, picture, "image/png");
  const before = (await pool.query("SELECT updated_at FROM owner_session"))
    .rows[0].updated_at;
  expect((await get(id)).status).toBe(200);
  expect(
    (await pool.query("SELECT updated_at FROM owner_session")).rows[0]
      .updated_at,
  ).toEqual(before);
  expect((await get(id, "")).status).toBe(401);
  const token = await pairDevice();
  expect((await get(id, `${DEVICE_COOKIE}=${token}`)).status).toBe(200);
  expect(
    (await pool.query("SELECT touched_at FROM device")).rows[0].touched_at,
  ).toBeNull();
  await pairDevice();
  expect((await get(id, `${DEVICE_COOKIE}=${token}`)).status).toBe(401);
  await pool.query(
    "UPDATE owner_session SET updated_at=now()-interval '16 minutes'",
  );
  expect((await get(id)).status).toBe(401);
});
it("persists files across storage instances and rejects tampered bytes or reused upload IDs", async () => {
  const id = randomUUID(),
    config = photoConfig();
  await uploadPhoto(id, picture, "image/png", config);
  expect(
    (await readPhoto(id, config, photoStore(config))).length,
  ).toBeGreaterThan(0);
  const different = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await expect(uploadPhoto(id, different, "image/png", config)).rejects.toThrow(
    "Permintaan foto berubah",
  );
  await photoStore(config).put(id, Buffer.from("corrupted"));
  await expect(readPhoto(id, config)).rejects.toThrow("unavailable");
});
it("cleans only old unreferenced assets, keeps inactive menu photos and never recycles deleted IDs", async () => {
  const attached = randomUUID(),
    unused = randomUUID();
  await uploadPhoto(attached, picture, "image/png");
  await uploadPhoto(unused, picture, "image/png");
  await saveMenu({
    id: item,
    name: "Coffee",
    price: 20000,
    active: false,
    imageUrl: photoUrl(attached),
  });
  await pool.query(
    "UPDATE menu_photo_asset SET touched_at=now()-interval '2 days'",
  );
  expect(await cleanupPhotos()).toEqual({ eligible: 1, deleted: 0 });
  expect(await cleanupPhotos(true)).toEqual({ eligible: 1, deleted: 1 });
  expect((await get(attached)).status).toBe(200);
  expect((await get(unused)).status).toBe(404);
  await expect(uploadPhoto(unused, picture, "image/png")).rejects.toThrow(
    "Permintaan foto berubah",
  );
});
it("resumes failed cleanup and refuses reference attachment once deletion has started", async () => {
  const id = randomUUID(),
    config = photoConfig();
  await uploadPhoto(id, picture, "image/png");
  await pool.query(
    "UPDATE menu_photo_asset SET touched_at=now()-interval '2 days'",
  );
  const store = photoStore(config);
  let fail = true;
  const delayed = {
    ...store,
    remove: async (key: string) => {
      await expect(
        saveMenu({
          id: item,
          name: "Coffee",
          price: 20000,
          active: true,
          imageUrl: photoUrl(key),
        }),
      ).rejects.toThrow("Foto belum tersedia");
      if (fail) throw new Error("storage unavailable");
      await store.remove(key);
    },
  };
  await expect(cleanupPhotos(true, config, delayed)).rejects.toThrow(
    "storage unavailable",
  );
  expect(
    (await pool.query("SELECT state FROM menu_photo_asset")).rows[0].state,
  ).toBe("deleting");
  fail = false;
  expect((await cleanupPhotos(true, config, delayed)).deleted).toBe(1);
});
it("serializes concurrent cleanup runs while external deletion is in flight", async () => {
  const id = randomUUID(),
    config = photoConfig(),
    store = photoStore(config);
  await uploadPhoto(id, picture, "image/png");
  await pool.query(
    "UPDATE menu_photo_asset SET touched_at=now()-interval '2 days'",
  );
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  const remove = vi.fn(async (key: string) => {
    started = true;
    await waiting;
    await store.remove(key);
  });
  const first = cleanupPhotos(true, config, { ...store, remove });
  try {
    await vi.waitFor(() => expect(started).toBe(true));
    expect(await cleanupPhotos(true, config, store)).toEqual({
      eligible: 0,
      deleted: 0,
      busy: true,
    });
  } finally {
    release();
    await first;
  }
  expect(remove).toHaveBeenCalledTimes(1);
  expect((await cleanupPhotos(true)).deleted).toBe(0);
});
