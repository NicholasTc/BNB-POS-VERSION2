"use client";
import { useState } from "react";
export function PinPad({
  busy,
  onSubmit,
  label,
  appearance,
}: {
  busy: boolean;
  onSubmit: (pin: string) => void;
  label: string;
  appearance?: "entry";
}) {
  const [pin, setPin] = useState("");
  return (
    <form
      className={appearance === "entry" ? "access-pin-form" : "stack"}
      onSubmit={(e) => {
        e.preventDefault();
        if (pin.length === 4) {
          onSubmit(pin);
          setPin("");
        }
      }}
    >
      <div>
        <label htmlFor="employee-pin">PIN karyawan</label>
        <input
          id="employee-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{4}"
          maxLength={4}
          value={pin}
          onChange={(e) =>
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
          }
          required
          aria-describedby="pin-help"
        />
        <small id="pin-help">Empat angka milik Anda.</small>
      </div>
      <div className="pin-grid">
        {(appearance === "entry"
          ? [1, 2, 3, 4, 5, 6, 7, 8, 9, "clear", 0, "Hapus"]
          : [1, 2, 3, 4, 5, 6, 7, 8, 9, "Hapus", 0]).map((n) => (
          <button
            type="button"
            className="secondary"
            key={n}
            aria-label={appearance === "entry" && n === "Hapus" ? "Hapus satu angka" : undefined}
            disabled={busy}
            onClick={() =>
              setPin((p) =>
                n === "clear" ? "" : n === "Hapus" ? p.slice(0, -1) : (p + String(n)).slice(0, 4),
              )
            }
          >
            {n === "clear" ? "Hapus" : n === "Hapus" && appearance === "entry" ? <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5h12v14H9l-7-7 7-7Zm3 4 6 6m0-6-6 6" /></svg> : n}
          </button>
        ))}
      </div>
      <button disabled={busy || pin.length !== 4}>
        {busy ? "Memeriksa…" : label}
      </button>
    </form>
  );
}
