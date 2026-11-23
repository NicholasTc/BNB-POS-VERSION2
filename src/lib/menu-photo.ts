// Shared public contract only. Storage configuration/credentials stay server-side.
export const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 500000;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Build a stable same-origin URL for an opaque managed photo ID; authorization is enforced when the image is requested. */
export const photoUrl = (id: string) => `/api/menu-photos/${id}.webp`;
/** Recognize only the canonical managed-photo UUID path and reject arbitrary/traversal paths. */
export function photoId(url: string) {
  return (
    /^\/api\/menu-photos\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.webp$/.exec(
      url,
    )?.[1] ?? null
  );
}
