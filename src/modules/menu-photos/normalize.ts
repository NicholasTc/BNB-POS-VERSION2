import sharp from "sharp";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  MAX_PHOTO_BYTES,
  PHOTO_TYPES,
} from "@/lib/menu-photo";
import { PhotoError, photoHash } from "./config";

export async function normalizePhoto(input: Buffer, mime: string) {
  if (input.length > MAX_PHOTO_UPLOAD_BYTES) throw new PhotoError("too_large");
  const signature = input.subarray(0, 12);
  const format =
    signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
      ? "jpeg"
      : signature
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "png"
        : signature.toString("ascii", 0, 4) === "RIFF" &&
            signature.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
  if (
    !format ||
    PHOTO_TYPES.indexOf(mime as (typeof PHOTO_TYPES)[number]) !==
      ["jpeg", "png", "webp"].indexOf(format)
  )
    throw new PhotoError("invalid_image");
  try {
    const image = sharp(input, {
      limitInputPixels: 24000000,
      failOn: "warning",
      animated: false,
    });
    const meta = await image.metadata();
    if (
      meta.format !== format ||
      (meta.pages ?? 1) > 1 ||
      !meta.width ||
      !meta.height
    )
      throw new PhotoError("invalid_image");
    for (const quality of [80, 65, 50]) {
      const bytes = await image
        .clone()
        .rotate()
        .resize({
          width: 960,
          height: 960,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toColourspace("srgb")
        .webp({ quality, effort: 4 })
        .timeout({ seconds: 8 })
        .toBuffer();
      if (bytes.length <= MAX_PHOTO_BYTES)
        return {
          bytes,
          inputHash: photoHash(input),
          contentHash: photoHash(bytes),
        };
    }
    throw new PhotoError("too_large");
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError("invalid_image");
  }
}
