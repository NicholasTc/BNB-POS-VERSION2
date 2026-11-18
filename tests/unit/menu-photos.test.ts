import { it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  photoConfig,
  photoHash,
  type PhotoConfig,
} from "../../src/modules/menu-photos/config";
import { normalizePhoto } from "../../src/modules/menu-photos/normalize";
import { photoStore } from "../../src/modules/menu-photos/storage";
import {
  photoUrl,
  photoId,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_UPLOAD_BYTES,
} from "../../src/lib/menu-photo";
import { menuImage } from "../../src/lib/menu";
const { send } = vi.hoisted(() => ({
  send: vi.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = send;
    destroy() {}
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
afterEach(() => vi.clearAllMocks());
const local = { DATABASE_URL: "postgresql://u:p@127.0.0.1:55439/lisi_test" };
const remote = {
  DATABASE_URL: "postgresql://u:p@db.internal/production",
  MENU_PHOTO_STORAGE: "s3",
  MENU_PHOTO_S3_ENVIRONMENT: "live",
  MENU_PHOTO_S3_ENDPOINT: "https://example.storage.test",
  MENU_PHOTO_S3_BUCKET: "cafe-images",
  MENU_PHOTO_S3_ACCESS_KEY_ID: "test-key",
  MENU_PHOTO_S3_SECRET_ACCESS_KEY: "test-secret",
};
it("accepts only canonical managed image references while preserving existing URLs and placeholders", () => {
  const url = photoUrl(randomUUID());
  expect(photoId(url)).not.toBeNull();
  expect(menuImage.safeParse(url).success).toBe(true);
  for (const value of [
    "/api/menu-photos/../../secret",
    "/api/menu-photos/not-a-uuid.webp",
    url + "?other=1",
    url.replace(".webp", ".svg"),
  ])
    expect(menuImage.safeParse(value).success).toBe(false);
  expect(menuImage.parse("https://example.com/photo.jpg")).toContain("https:");
  expect(menuImage.parse("/menu/coffee.webp")).toBe("/menu/coffee.webp");
});
it("defaults to isolated local storage only on a loopback development/test database", () => {
  expect(photoConfig(local).mode).toBe("local");
  for (const patch of [
    { DATABASE_URL: remote.DATABASE_URL },
    { RAILWAY_ENVIRONMENT_ID: "hosted" },
    { DATABASE_URL: local.DATABASE_URL + "?host=evil" },
    { MENU_PHOTO_STORAGE: "off" },
  ])
    expect(() => photoConfig({ ...local, ...patch })).toThrow("configuration");
});
it("pins S3 environment and target without depending on credential rotation", () => {
  const config = photoConfig(remote);
  expect(config.mode).toBe("s3");
  expect(
    photoConfig({ ...remote, MENU_PHOTO_S3_SECRET_ACCESS_KEY: "rotated" })
      .target,
  ).toBe(config.target);
  expect(() => photoConfig({ ...remote, ...local })).toThrow("configuration");
  for (const endpoint of [
    "http://example.com",
    "https://key:secret@example.com",
    "https://example.com/path",
    "https://example.com/?key=secret",
  ])
    expect(() =>
      photoConfig({ ...remote, MENU_PHOTO_S3_ENDPOINT: endpoint }),
    ).toThrow("configuration");
  expect(() =>
    photoConfig({ ...remote, DATABASE_URL: "https://db.internal/production" }),
  ).toThrow("configuration");
});
it("corrects camera orientation, resizes and strips metadata before producing bounded WebP", async () => {
  const original = await sharp({
    create: { width: 1800, height: 1200, channels: 3, background: "#28624b" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const result = await normalizePhoto(original, "image/jpeg"),
    meta = await sharp(result.bytes).metadata();
  expect([meta.width, meta.height]).toEqual([640, 960]);
  expect(meta.format).toBe("webp");
  expect(meta.exif).toBeUndefined();
  expect(meta.orientation).toBeUndefined();
  expect(result.bytes.length).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
  expect(result.contentHash).toBe(photoHash(result.bytes));
});
it("supports transparent PNG and static WebP without enlarging small images", async () => {
  const png = await sharp({
    create: {
      width: 20,
      height: 30,
      channels: 4,
      background: { r: 0, g: 100, b: 0, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer();
  const image = await normalizePhoto(png, "image/png"),
    meta = await sharp(image.bytes).metadata();
  expect(meta.hasAlpha).toBe(true);
  expect(meta.width).toBe(20);
  expect(meta.height).toBe(30);
  expect(
    (await normalizePhoto(image.bytes, "image/webp")).bytes.length,
  ).toBeGreaterThan(0);
});
it("rejects SVG, HTML, mismatched formats, corrupt files and oversized bodies", async () => {
  const png = await sharp({
    create: { width: 5, height: 5, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  for (const [bytes, type] of [
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/png"],
    [Buffer.from("<html>evil</html>"), "image/jpeg"],
    [png, "image/jpeg"],
    [Buffer.from([255, 216, 255, 0]), "image/jpeg"],
  ] as const)
    await expect(normalizePhoto(bytes, type)).rejects.toThrow("invalid_image");
  await expect(
    normalizePhoto(Buffer.alloc(MAX_PHOTO_UPLOAD_BYTES + 1), "image/png"),
  ).rejects.toThrow("too_large");
});
it("persists local files atomically with private permissions and refuses path injection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lisi-photo-unit-")),
    id = randomUUID();
  const config: PhotoConfig = {
    mode: "local",
    directory,
    target: photoHash(directory),
  };
  try {
    const first = photoStore(config);
    await first.put(id, Buffer.from("test-binary"));
    expect(await photoStore(config).get(id)).toEqual(
      Buffer.from("test-binary"),
    );
    expect((await stat(join(directory, id + ".webp"))).mode & 0o777).toBe(
      0o600,
    );
    await expect(first.get("../../secret")).rejects.toThrow("unavailable");
    await first.remove(id);
    await first.remove(id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it("restricts S3 operations to the configured photo prefix with fixed image headers and bounded reads", async () => {
  const store = photoStore(photoConfig(remote)),
    id = randomUUID();
  send.mockResolvedValueOnce({});
  await store.put(id, Buffer.from("bytes"));
  expect((send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
    Bucket: "cafe-images",
    Key: `live/menu-photos/v1/${id}.webp`,
    ContentType: "image/webp",
  });
  const read = vi.fn(async () => new Uint8Array(2));
  send.mockResolvedValueOnce({
    ContentLength: MAX_PHOTO_BYTES + 1,
    Body: { transformToByteArray: read },
  });
  await expect(store.get(id)).rejects.toThrow("unavailable");
  expect(read).not.toHaveBeenCalled();
  send.mockResolvedValueOnce({});
  await store.remove(id);
  expect((send.mock.calls[2][0] as { input: unknown }).input).toEqual({
    Bucket: "cafe-images",
    Key: `live/menu-photos/v1/${id}.webp`,
  });
});
