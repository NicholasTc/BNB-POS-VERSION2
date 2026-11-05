import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { menuPhotoAsset, audit, device } from "@/db/schema";
import { AppError, requireOwner } from "@/lib/http";
import { photoId, photoUrl } from "@/lib/menu-photo";
import { deviceToken } from "@/modules/attendance";
import { digest } from "@/lib/credentials";
import { photoConfig, PhotoError, photoHash, type PhotoConfig } from "./config";
import { normalizePhoto } from "./normalize";
import { photoStore, type PhotoStore } from "./storage";

let processing = 0;
export async function uploadPhoto(
  id: string,
  bytes: Buffer,
  mime: string,
  config: PhotoConfig = photoConfig(),
  store: PhotoStore = photoStore(config),
) {
  if (processing >= 2)
    throw new AppError(
      429,
      "Foto sedang diproses. Tunggu sebentar lalu coba lagi.",
    );
  processing++;
  try {
    if (photoId(photoUrl(id)) !== id)
      throw new AppError(400, "Permintaan foto tidak valid.");
    const image = await normalizePhoto(bytes, mime);
    // Durable reservation survives failed PUTs and ambiguous responses. Reusing
    // an upload ID with different content is rejected; URLs are never recycled.
    await db
      .insert(menuPhotoAsset)
      .values({
        id,
        inputHash: image.inputHash,
        contentHash: image.contentHash,
        bytes: image.bytes.length,
        mode: config.mode,
        target: config.target,
      })
      .onConflictDoNothing();
    return await db.transaction(async (tx) => {
      const [asset] = await tx
        .select()
        .from(menuPhotoAsset)
        .where(eq(menuPhotoAsset.id, id))
        .for("update");
      if (
        !asset ||
        asset.inputHash !== image.inputHash ||
        asset.contentHash !== image.contentHash ||
        asset.target !== config.target ||
        asset.mode !== config.mode ||
        !["pending", "ready"].includes(asset.state)
      )
        throw new AppError(409, "Permintaan foto berubah. Pilih foto kembali.");
      if (asset.state !== "ready") {
        try {
          await store.put(id, image.bytes);
        } catch {
          throw new PhotoError("unavailable");
        }
        await tx
          .update(menuPhotoAsset)
          .set({ state: "ready", touchedAt: new Date() })
          .where(eq(menuPhotoAsset.id, id));
        await tx.insert(audit).values({
          actor: "owner",
          action: "menu.photo.upload",
          details: { photoId: id, bytes: image.bytes.length },
        });
      }
      return { imageUrl: photoUrl(id) };
    });
  } finally {
    processing--;
  }
}
export async function authorizePhotoRead(request: Request) {
  // Read-only pairing check: image requests never take the cashier device lock.
  let token: string | undefined;
  try {
    token = deviceToken(request);
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 401) throw error;
  }
  if (token) {
    const allowed = await db
      .select({ id: device.id })
      .from(device)
      .where(
        sql`${device.tokenHash}=${digest(token)} AND ${device.expiresAt}>now()`,
      );
    if (allowed.length) return;
  }
  // An image load is passive: it must not keep an unattended owner logged in.
  const headers = new Headers(request.headers);
  headers.set("x-lisi-background", "1");
  await requireOwner(new Request(request.url, { headers }));
}
export async function readPhoto(
  id: string,
  config: PhotoConfig = photoConfig(),
  store: PhotoStore = photoStore(config),
) {
  if (photoId(photoUrl(id)) !== id)
    throw new AppError(404, "Foto tidak ditemukan.");
  const [asset] = await db
    .select()
    .from(menuPhotoAsset)
    .where(eq(menuPhotoAsset.id, id));
  if (!asset || asset.state !== "ready")
    throw new AppError(404, "Foto tidak ditemukan.");
  if (asset.target !== config.target || asset.mode !== config.mode)
    throw new PhotoError("configuration");
  const bytes = await store.get(id);
  if (bytes.length !== asset.bytes || photoHash(bytes) !== asset.contentHash)
    throw new PhotoError("unavailable");
  return bytes;
}
export async function cleanupPhotos(
  apply = false,
  config: PhotoConfig = photoConfig(),
  store: PhotoStore = photoStore(config),
) {
  // Session lock spans committed deletion state and the external DELETE. An
  // outer transaction would incorrectly resurrect ready state on a lost reply.
  const client = apply ? await pool.connect() : undefined;
  let locked = false;
  try {
    if (client) {
      locked = (
        await client.query("SELECT pg_try_advisory_lock(891111) AS held")
      ).rows[0].held;
      if (!locked) return { eligible: 0, deleted: 0, busy: true };
    }
    return await cleanupBatch(apply, config, store);
  } finally {
    if (client) {
      try {
        if (locked) await client.query("SELECT pg_advisory_unlock(891111)");
        client.release();
      } catch {
        client.release(true);
      }
    }
  }
}
async function cleanupBatch(
  apply: boolean,
  config: PhotoConfig,
  store: PhotoStore,
) {
  // One bounded administrative batch. Old source URLs and bundled files are
  // never eligible. Reference attachment and deletion share the asset row lock.
  const candidates = await db.execute<{ id: string }>(
    sql`SELECT a.id FROM menu_photo_asset a WHERE a.target=${config.target} AND a.mode=${config.mode} AND a.state IN ('pending','ready','deleting') AND a.touched_at<now()-interval '24 hours' AND NOT EXISTS (SELECT 1 FROM menu_item m WHERE m.image_url='/api/menu-photos/'||a.id||'.webp') ORDER BY a.touched_at LIMIT 25`,
  );
  if (!apply) return { eligible: candidates.rows.length, deleted: 0 };
  let deleted = 0;
  for (const { id } of candidates.rows) {
    const selected = await db.transaction(async (tx) => {
      const [asset] = await tx
        .select()
        .from(menuPhotoAsset)
        .where(eq(menuPhotoAsset.id, id))
        .for("update");
      if (
        !asset ||
        asset.target !== config.target ||
        !["pending", "ready", "deleting"].includes(asset.state) ||
        Date.now() - asset.touchedAt.getTime() < 86400000
      )
        return false;
      const referenced = await tx.execute(
        sql`SELECT 1 FROM menu_item WHERE image_url=${photoUrl(id)} LIMIT 1`,
      );
      if (referenced.rows.length) return false;
      await tx
        .update(menuPhotoAsset)
        .set({ state: "deleting" })
        .where(eq(menuPhotoAsset.id, id));
      return true;
    });
    if (!selected) continue;
    await store.remove(id); // Failure leaves a resumable tombstone, never a link.
    await db
      .update(menuPhotoAsset)
      .set({ state: "deleted" })
      .where(eq(menuPhotoAsset.id, id));
    deleted++;
  }
  return { eligible: candidates.rows.length, deleted };
}
