# Owner menu photos

Owner → Pengaturan → Menu kafe → Ubah menu → Ganti foto (or Unggah foto) → Simpan menu. The picker previews the file; uploading stages it, and Save applies it. Names, prices, categories, availability, existing HTTPS URLs and bundled placeholders remain editable. Gunakan foto bawaan stages removal of the custom image until Save. Indonesian/English controls follow the existing owner language.

Accept static JPG, PNG or WebP, at most 8 MiB and 24 million decoded pixels. The server checks actual signatures/decoder results, corrects orientation, strips metadata and converts to WebP inside 960×960, without enlarging smaller photos. Output is at most 500,000 bytes (usually much smaller). SVG, HTML, animated and corrupt files are refused. At most two conversions run concurrently per server process; owner upload requests are limited to 20/minute. Neither upload nor viewing changes sales, attendance, stock or spreadsheet records.

## Local use

Loopback lisi_dev and lisi_test default to separate ignored directories under `.local/menu-photos/`. Files are created privately and atomically, survive app restarts, and are not committed. Explicit MENU_PHOTO_LOCAL_DIR is administrative configuration, never a request parameter. Keep this directory stable; the asset metadata pins its storage target. Automated tests force isolated test storage and cannot access cloud storage.

Migration 0012 adds only menu_photo_asset lifecycle metadata. Run the normal migration command after a database backup before using the feature. Existing image_url values are preserved. SQL backups contain metadata/references, **not image binaries**: preserve the photo directory separately for local recovery. Uploading local files does not copy them into a future live bucket.

## Railway setup (not performed)

Hosted uploads stay disabled until explicitly configured. The user has not created a bucket yet. No live infrastructure, variables, deployment or bucket credentials were changed in this task.

1. Create a private Railway Storage Bucket for production menu photos.
2. In the POS application service's private variables, set the following using the bucket's credentials. Use Railway references where available; do not commit credentials or use NEXT_PUBLIC_ variables.

```dotenv
MENU_PHOTO_STORAGE=s3
MENU_PHOTO_S3_ENVIRONMENT=live
MENU_PHOTO_S3_ENDPOINT=https://<bucket-S3-endpoint>
MENU_PHOTO_S3_BUCKET=<bucket-name>
MENU_PHOTO_S3_REGION=auto
MENU_PHOTO_S3_ACCESS_KEY_ID=<access-key-id>
MENU_PHOTO_S3_SECRET_ACCESS_KEY=<secret-access-key>
```

3. With separate rollout authorization, back up production SQL, apply migrations using the existing pre-deploy command, and deploy. Upload a photo, Save, check a separate connected cashier, restart/redeploy and verify it still loads.

For cloud testing, use a separate bucket, a dedicated database named lisi_test and environment=test. The configuration guard recognizes lisi_dev/lisi_test names (or loopback databases) as test; other remote databases require environment=live. Do not point a staging app at the production database. Local mode is prohibited in Railway, preventing accidental writes into ephemeral deployment storage. Images use fixed `<environment>/menu-photos/v1/<uuid>.webp` keys; endpoint, bucket and prefix pin the target. Credential rotation keeps references valid. Changing bucket/endpoint/prefix requires a deliberate asset migration; this module does not silently move or rebind files.

The app proxies private bucket reads; browsers receive same-origin image paths and never receive storage credentials. This avoids public buckets, browser CORS changes and expiring links in menu records. Railway app egress and bucket operations can incur charges. Maintain an independent bucket backup/versioning policy alongside SQL backups; bucket availability/restore/billing have not been verified against a real bucket here. See [Railway serving guidance](https://docs.railway.com/storage-buckets/uploading-serving).

## Consistency and recovery

- POST upload requires the existing owner session and exact same-origin request. Employee PIN/device authorization cannot upload, select a menu photo or access owner APIs. Photo GET accepts a valid paired browser or owner, with read-only device validation and passive owner validation; it does not extend either idle timer or take the cashier device row lock.
- Every upload has a unique immutable UUID URL. Same-file retries reuse the upload ID; changed files, invalid/deleted IDs and unconfirmed staged assets are rejected. A durable pending reservation survives failed or ambiguous storage writes. No storage secrets, original filenames or EXIF are saved in menu records.
- Storage failures leave the current menu image intact. Cancel aborts the browser request and preserves the draft/current image; a completed server upload can remain unused for later cleanup. Save stays disabled while uploading. Failed/lost replies show a retry action. A stale owner form cannot overwrite a newer saved photo.
- Existing cashier polling picks up the new URL while visible and idle, normally within five seconds. Existing payment/recovery pauses remain in place. No cart reset, payment recalculation or historical snapshot rewrite is introduced. Existing fallback images cover unavailable image responses.
- Bucket access has finite timeouts; image reads verify recorded size/hash. S3 SDK clients are reused rather than created per image. Reads are bounded to the normalized image size and responses use private immutable caching. Photos already cached by a browser can remain visible after logout; menu photos are ordinary product imagery and contain no owner/report data.

## Unused-photo cleanup

`npm run photos:cleanup` is a dry run. `npm run photos:cleanup -- --apply` explicitly removes at most 25 assets per run, after a 24-hour grace period, only from the configured target and only when no menu (including an inactive menu) references them. No cleanup schedule is installed automatically. Each managed reference is canonicalized and locked during Save; cleanup rechecks references under the same asset lock. Concurrent apply runs use advisory lock 891111. External deletion commits a resumable deleting state before contacting storage. Failed deletions can be retried; deleted UUID tombstones are retained so URLs are never reused. Bundled files, arbitrary HTTPS URLs, unknown bucket objects and current menu photos are never swept.

The database is authoritative for references. Direct manual SQL edits that bypass saveMenu are outside the cleanup contract. Do not attach unmanaged relative paths or repoint storage variables to a different bucket. Cleanup is a separate administrative command and does not run in checkout.
