// Shared public contract only. Storage configuration/credentials stay server-side.
export const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 500000;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const photoUrl = (id: string) => `/api/menu-photos/${id}.webp`;
export function photoId(url: string) {
  return (
    /^\/api\/menu-photos\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.webp$/.exec(
      url,
    )?.[1] ?? null
  );
}
