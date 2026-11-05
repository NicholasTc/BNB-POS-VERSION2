import { createHash } from "node:crypto";
import { resolve } from "node:path";
export class PhotoError extends Error {
  constructor(
    public code:
      "configuration" | "unavailable" | "invalid_image" | "too_large",
  ) {
    super(code);
    this.name = "PhotoError";
  }
}
export type PhotoConfig =
  | { mode: "local"; directory: string; target: string }
  | {
      mode: "s3";
      endpoint: string;
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      prefix: string;
      target: string;
    };
export const photoHash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
export function photoConfig(
  input: Record<string, string | undefined> = process.env,
): PhotoConfig {
  let local = false,
    test = false;
  try {
    const url = new URL(input.DATABASE_URL ?? "");
    local =
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      !url.search &&
      ["postgres:", "postgresql:"].includes(url.protocol);
    test = ["/lisi_dev", "/lisi_test"].includes(url.pathname);
    if (
      !url.hostname ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.searchParams.has("host")
    )
      throw new PhotoError("configuration");
  } catch {
    throw new PhotoError("configuration");
  }
  const mode =
    input.MENU_PHOTO_STORAGE ??
    (local && test && !input.RAILWAY_ENVIRONMENT_ID ? "local" : "off");
  if (mode === "local" && local && test && !input.RAILWAY_ENVIRONMENT_ID) {
    const database = new URL(input.DATABASE_URL!).pathname.slice(1);
    const directory = resolve(
      /* turbopackIgnore: true */
      input.MENU_PHOTO_LOCAL_DIR ?? `.local/menu-photos/${database}`,
    );
    return { mode, directory, target: photoHash("local:" + directory) };
  }
  if (
    mode !== "s3" ||
    input.MENU_PHOTO_S3_ENVIRONMENT !== (local || test ? "test" : "live")
  )
    throw new PhotoError("configuration");
  let endpoint: URL;
  try {
    endpoint = new URL(input.MENU_PHOTO_S3_ENDPOINT ?? "");
  } catch {
    throw new PhotoError("configuration");
  }
  const bucket = input.MENU_PHOTO_S3_BUCKET ?? "",
    region = input.MENU_PHOTO_S3_REGION ?? "auto",
    accessKeyId = input.MENU_PHOTO_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey = input.MENU_PHOTO_S3_SECRET_ACCESS_KEY ?? "";
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/" ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    !/^[a-z0-9-]{1,40}$/.test(region) ||
    !accessKeyId ||
    !secretAccessKey
  )
    throw new PhotoError("configuration");
  const prefix = `${input.MENU_PHOTO_S3_ENVIRONMENT}/menu-photos/v1/`;
  return {
    mode,
    endpoint: endpoint.origin,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    prefix,
    target: photoHash(JSON.stringify([endpoint.origin, bucket, prefix])),
  };
}
