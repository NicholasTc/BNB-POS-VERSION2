import { z } from "zod";
import { endpoint, json, limit, requireOwner, AppError } from "@/lib/http";
import { uploadHeaders, photoBody } from "@/modules/menu-photos/request";
import { uploadPhoto } from "@/modules/menu-photos/server";
import { PhotoError, photoConfig } from "@/modules/menu-photos/config";
export const runtime = "nodejs";
export const POST = endpoint(async (request) => {
  const mime = uploadHeaders(request);
  await requireOwner(request);
  await limit("owner-menu-photo", 20, 60);
  const parsed = z.uuidv4().safeParse(request.headers.get("x-upload-id"));
  if (!parsed.success) throw new AppError(400, "Permintaan foto tidak valid.");
  try {
    const config = photoConfig();
    const bytes = await photoBody(request);
    await requireOwner(request); // Recheck after receiving the body.
    return json(await uploadPhoto(parsed.data, bytes, mime, config));
  } catch (error) {
    if (error instanceof PhotoError) {
      if (error.code === "invalid_image")
        throw new AppError(
          400,
          "Foto tidak valid. Gunakan JPG, PNG, atau WebP tanpa animasi.",
        );
      if (error.code === "too_large")
        throw new AppError(
          413,
          "Foto terlalu besar. Pilih foto yang lebih kecil.",
        );
      throw new AppError(
        503,
        "Penyimpanan foto belum tersedia. Foto lama tetap digunakan.",
      );
    }
    throw error;
  }
});
