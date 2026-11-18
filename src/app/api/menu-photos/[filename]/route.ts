import { endpoint, AppError } from "@/lib/http";
import { photoId } from "@/lib/menu-photo";
import { authorizePhotoRead, readPhoto } from "@/modules/menu-photos/server";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  return endpoint(async (req) => {
    await authorizePhotoRead(req);
    const { filename } = await context.params;
    const id = photoId("/api/menu-photos/" + filename);
    if (!id) throw new AppError(404, "Foto tidak ditemukan.");
    const bytes = await readPhoto(id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(bytes.length),
      },
    });
  })(request);
}
