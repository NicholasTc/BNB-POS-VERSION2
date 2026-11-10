import { eq } from "drizzle-orm";
import { menuPhotoAsset } from "@/db/schema";
import { AppError } from "@/lib/http";
import { env } from "@/lib/env";
import { photoId } from "@/lib/menu-photo";
import type { Transaction } from "@/modules/attendance";
import { photoConfig } from "./config";
export async function lockPhotoReference(
  tx: Transaction,
  value: string | undefined,
) {
  if (value === undefined) return undefined;
  let url = value;
  try {
    const absolute = new URL(value);
    if (
      absolute.origin === new URL(env().BETTER_AUTH_URL).origin &&
      photoId(absolute.pathname)
    )
      url = absolute.pathname;
  } catch {
    /* Relative/bundled paths are already validated by the menu schema. */
  }
  const id = photoId(url);
  if (!id) return url;
  const [asset] = await tx
    .select()
    .from(menuPhotoAsset)
    .where(eq(menuPhotoAsset.id, id))
    .for("update");
  let target: string;
  try {
    target = photoConfig().target;
  } catch {
    throw new AppError(
      503,
      "Penyimpanan foto belum tersedia. Foto lama tetap digunakan.",
    );
  }
  if (!asset || asset.state !== "ready" || asset.target !== target)
    throw new AppError(
      409,
      "Foto belum tersedia. Unggah kembali sebelum menyimpan menu.",
    );
  await tx
    .update(menuPhotoAsset)
    .set({ touchedAt: new Date() })
    .where(eq(menuPhotoAsset.id, id));
  return url;
}
