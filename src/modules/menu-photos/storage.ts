import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { MAX_PHOTO_BYTES, photoId, photoUrl } from "@/lib/menu-photo";
import { PhotoError, photoHash, type PhotoConfig } from "./config";
let cachedClient: { identity: string; client: S3Client } | undefined;
export interface PhotoStore {
  put(id: string, bytes: Buffer): Promise<void>;
  get(id: string): Promise<Buffer>;
  remove(id: string): Promise<void>;
}
/** Choose an isolated local or private S3 adapter; callers own upload/attachment lifecycle metadata and ambiguous-response recovery. */
export function photoStore(config: PhotoConfig): PhotoStore {
  /** Validate an opaque photo ID before deriving a fixed WebP basename; reject traversal/path injection. */
  const name = (id: string) => {
    if (photoId(photoUrl(id)) !== id) throw new PhotoError("unavailable");
    return `${id}.webp`;
  };
  if (config.mode === "local")
    return {
      /** Write normalized bytes to the configured private adapter target; the caller records ready state only after this returns. */
      async put(id, bytes) {
        await mkdir(config.directory, { recursive: true, mode: 0o700 });
        const target = join(config.directory, name(id)),
          temp = target + "." + randomUUID() + ".tmp";
        try {
          await writeFile(temp, bytes, { mode: 0o600, flag: "wx" });
          await rename(temp, target);
        } finally {
          await unlink(temp).catch(() => {});
        }
      },
      /** Read the configured object with storage size/time bounds; the caller verifies metadata/content digests before serving. */
      async get(id) {
        const path = join(config.directory, name(id));
        const metadata = await stat(path);
        if (!metadata.isFile() || metadata.size > MAX_PHOTO_BYTES)
          throw new PhotoError("unavailable");
        return readFile(path);
      },
      /** Delete only the validated managed object; the caller preserves a deletion tombstone when the result is uncertain. */
      async remove(id) {
        try {
          await unlink(join(config.directory, name(id)));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      },
    };
  const identity = photoHash(
    JSON.stringify([
      config.target,
      config.region,
      config.accessKeyId,
      config.secretAccessKey,
    ]),
  );
  if (cachedClient?.identity !== identity) {
    cachedClient?.client.destroy();
    cachedClient = {
      identity,
      client: new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        maxAttempts: 1,
      }),
    };
  }
  const s3 = cachedClient.client;
  /** Combine the validated configured S3 prefix and photo basename; no user-provided directory is accepted. */
  const key = (id: string) => config.prefix + name(id);
  return {
    /** Write normalized bytes to the configured private adapter target; the caller records ready state only after this returns. */
    async put(id, bytes) {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key(id),
          Body: bytes,
          ContentType: "image/webp",
          CacheControl: "private, max-age=31536000, immutable",
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
    },
    /** Read the configured object with storage size/time bounds; the caller verifies metadata/content digests before serving. */
    async get(id) {
      const result = await s3.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key(id) }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      if (
        !result.Body ||
        !result.ContentLength ||
        result.ContentLength > MAX_PHOTO_BYTES
      )
        throw new PhotoError("unavailable");
      const bytes = Buffer.from(await result.Body.transformToByteArray());
      if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoError("unavailable");
      return bytes;
    },
    /** Delete only the validated managed object; the caller preserves a deletion tombstone when the result is uncertain. */
    async remove(id) {
      await s3.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key(id) }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
    },
  };
}
