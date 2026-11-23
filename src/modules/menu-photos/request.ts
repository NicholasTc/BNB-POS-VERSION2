import { AppError } from "@/lib/http";
import { env } from "@/lib/env";
import { MAX_PHOTO_UPLOAD_BYTES, PHOTO_TYPES } from "@/lib/menu-photo";
/** Require canonical Origin and an allowed image MIME type before reading upload bytes; authorization remains the route responsibility. */
export function uploadHeaders(request: Request) {
  if (request.headers.get("origin") !== new URL(env().BETTER_AUTH_URL).origin)
    throw new AppError(403, "Permintaan tidak diizinkan. Muat ulang halaman.");
  const mime = request.headers.get("content-type") ?? "";
  if (!PHOTO_TYPES.includes(mime as (typeof PHOTO_TYPES)[number]))
    throw new AppError(415, "Gunakan foto JPG, PNG, atau WebP.");
  return mime;
}
/** Read an upload stream with the existing 8 MB bound and release its reader; never buffer an unbounded file. */
export async function photoBody(request: Request) {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_PHOTO_UPLOAD_BYTES)
  )
    throw new AppError(413, "Ukuran foto maksimal 8 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Pilih foto terlebih dahulu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_PHOTO_UPLOAD_BYTES) {
        await reader.cancel();
        throw new AppError(413, "Ukuran foto maksimal 8 MB.");
      }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}
