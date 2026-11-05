"use client";
import { useEffect, useRef, useState } from "react";
import { useOwnerLanguage } from "./owner-language";
import { ownerMessage } from "@/lib/owner-language";
import { notifyOwnerSignedOut } from "@/lib/owner-session-events";
import { MAX_PHOTO_UPLOAD_BYTES, PHOTO_TYPES, photoId } from "@/lib/menu-photo";
import { ProductPhoto } from "./product-photo";
type Upload = { id: string; file: File };
export function MenuPhotoField({
  initialValue,
  disabled,
  onBusy,
}: {
  initialValue: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const { t, language } = useOwnerLanguage();
  const [value, setValue] = useState(initialValue),
    [preview, setPreview] = useState(""),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState<Upload | null>(null);
  const picker = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
      onBusy(false);
    },
    [onBusy],
  );
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setWorking(false);
    onBusy(false);
    setPreview("");
    setError("");
    setRetry(null);
  }
  async function upload(job: Upload) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setError("");
    setWorking(true);
    onBusy(true);
    setRetry(job);
    try {
      if (!PHOTO_TYPES.includes(job.file.type as (typeof PHOTO_TYPES)[number]))
        throw new Error("Gunakan foto JPG, PNG, atau WebP.");
      if (job.file.size > MAX_PHOTO_UPLOAD_BYTES)
        throw new Error("Ukuran foto maksimal 8 MB.");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Foto tidak dapat dibaca. Pilih foto kembali."));
        reader.readAsDataURL(job.file);
      });
      if (controller.current !== current) return;
      setPreview(data);
      const response = await fetch("/api/owner/menu/photos", {
        method: "POST",
        headers: { "Content-Type": job.file.type, "X-Upload-Id": job.id },
        body: job.file,
        signal: AbortSignal.any([current.signal, AbortSignal.timeout(45000)]),
        cache: "no-store",
      });
      const result = await response.json();
      if (response.status === 401) notifyOwnerSignedOut();
      if (!response.ok)
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Unggahan belum dikonfirmasi. Coba unggah kembali.",
        );
      if (typeof result.imageUrl !== "string" || !photoId(result.imageUrl))
        throw new Error("Unggahan belum dikonfirmasi. Coba unggah kembali.");
      if (controller.current !== current) return;
      setValue(result.imageUrl);
      setPreview("");
      setRetry(null);
    } catch (e) {
      if (controller.current === current) {
        setPreview("");
        setError(
          e instanceof Error &&
            e.name !== "TypeError" &&
            e.name !== "TimeoutError"
            ? e.message
            : "Unggahan belum dikonfirmasi. Coba unggah kembali.",
        );
      }
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setWorking(false);
        onBusy(false);
      }
    }
  }
  return (
    <div className="menu-photo-field stack">
      <label htmlFor="menu-image">{t("Foto menu (opsional)")}</label>
      <div className="menu-photo-picker">
        <div
          className="menu-photo-preview"
          role="img"
          aria-label={t("Pratinjau foto menu")}
        >
          <ProductPhoto
            key={preview || value}
            imageUrl={preview || value}
            category="uncategorized"
          />
        </div>
        <div className="stack">
          <input
            ref={picker}
            id="menu-photo-upload"
            aria-label={t("Pilih foto dari perangkat")}
            type="file"
            accept={PHOTO_TYPES.join(",")}
            hidden
            disabled={disabled || working}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload({ id: crypto.randomUUID(), file });
            }}
          />
          <button
            type="button"
            className="secondary"
            disabled={disabled || working}
            onClick={() => picker.current?.click()}
          >
            {working
              ? t("Mengunggah foto…")
              : value
                ? t("Ganti foto")
                : t("Unggah foto")}
          </button>
          {working ? (
            <button type="button" className="link-button" onClick={cancel}>
              {t("Batalkan unggahan")}
            </button>
          ) : (
            value && (
              <button
                type="button"
                className="link-button"
                disabled={disabled}
                onClick={() => {
                  setValue("");
                  setError("");
                  setRetry(null);
                }}
              >
                {t("Gunakan foto bawaan")}
              </button>
            )
          )}
          <small className="muted">
            {t("JPG, PNG, atau WebP. Maksimal 8 MB.")}
          </small>
        </div>
      </div>
      {error && (
        <div className="stack">
          <p className="error" role="alert">
            {ownerMessage(error, language)}
          </p>
          {retry && (
            <button
              type="button"
              className="secondary"
              disabled={disabled || working}
              onClick={() => void upload(retry)}
            >
              {t("Coba unggah lagi")}
            </button>
          )}
        </div>
      )}
      {value !== initialValue && !working && (
        <small className="success" role="status">
          {t("Klik Simpan menu untuk menerapkan foto.")}
        </small>
      )}
      <input
        id="menu-image"
        name="imageUrl"
        type="text"
        list="menu-photos"
        maxLength={2000}
        value={value}
        disabled={disabled || working}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
          setRetry(null);
        }}
        placeholder="https://…"
        aria-describedby="menu-image-help"
      />
      <datalist id="menu-photos">
        {(
          [
            ["mango", "Contoh mangga"],
            ["strawberry", "Contoh stroberi"],
            ["coffee", "Contoh kopi"],
            ["pastry", "Contoh makanan"],
            ["avocado", "Contoh alpukat"],
            ["tea", "Contoh teh"],
            ["water", "Contoh air mineral"],
          ] as const
        ).map(([name, label]) => (
          <option key={name} value={`/menu/${name}.webp`}>
            {t(label)}
          </option>
        ))}
      </datalist>
      <small id="menu-image-help">
        {t(
          "Atau gunakan URL HTTPS atau foto contoh. Kosongkan untuk foto bawaan.",
        )}
      </small>
    </div>
  );
}
