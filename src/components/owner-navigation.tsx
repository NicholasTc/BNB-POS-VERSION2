"use client";
import { useOwnerLanguage } from "./owner-language";
export type OwnerView = "summary" | "transactions" | "staff" | "settings";
export const ownerViews = [
  { id: "summary", label: "Ringkasan" },
  { id: "transactions", label: "Transaksi" },
  { id: "staff", label: "Staf" },
  { id: "settings", label: "Pengaturan" },
] as const;
export function OwnerIcon({ name }: { name: OwnerView | "calendar" }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "summary" ? (
        <>
          <path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9" />
        </>
      ) : name === "transactions" ? (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h1m3 0h4M8 12h1m3 0h4M8 17h1m3 0h4" />
        </>
      ) : name === "staff" ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 6" />
        </>
      ) : name === "calendar" ? (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4M17 3v4M3 11h18" />
        </>
      ) : (
        <>
          <path d="m9 3-.6 2.5-2 .9L4 5.7 2 9l1.8 1.8v2.4L2 15l2 3.3 2.4-.7 2 .9L9 21h6l.6-2.5 2-.9 2.4.7 2-3.3-1.8-1.8v-2.4L22 9l-2-3.3-2.4.7-2-.9L15 3Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}
export function OwnerNavigation({
  view,
  onChange,
}: {
  view: OwnerView;
  onChange: (view: OwnerView) => void;
}) {
  const { t } = useOwnerLanguage();
  return (
    <nav className="owner-navigation" aria-label={t("Navigasi pemilik")}>
      {ownerViews.map((item) => (
        <button
          key={item.id}
          aria-current={view === item.id ? "page" : undefined}
          aria-controls={`owner-${item.id}`}
          onClick={() => onChange(item.id)}
        >
          <OwnerIcon name={item.id} />
          <span>{t(item.label)}</span>
        </button>
      ))}
    </nav>
  );
}
