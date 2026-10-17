"use client";
import { useState } from "react";
export function PinPad({
  busy,
  onSubmit,
  label,
}: {
  busy: boolean;
  onSubmit: (pin: string) => void;
  label: string;
}) {
  const [pin, setPin] = useState("");
  return (
    <form
      className="stack"
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
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, "Hapus", 0].map((n) => (
          <button
            type="button"
            className="secondary"
            key={n}
            disabled={busy}
            onClick={() =>
              setPin((p) =>
                n === "Hapus" ? p.slice(0, -1) : (p + String(n)).slice(0, 4),
              )
            }
          >
            {n}
          </button>
        ))}
      </div>
      <button disabled={busy || pin.length !== 4}>
        {busy ? "Memeriksa…" : label}
      </button>
    </form>
  );
}
