export function PosIcon({ name }: { name: "cash" | "qris" | "chevron" }) {
  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "cash" ? (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <circle cx="12" cy="12" r="3" />
          <path d="M5 9h1M18 15h1" />
        </>
      ) : name === "chevron" ? (
        <path d="m6 9 6 6 6-6" />
      ) : (
        <>
          <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM21 15v6h-6M12 3v3M12 10v3H9M3 12h3M12 18v3M18 12h3" />
        </>
      )}
    </svg>
  );
}
export function LisiLogo() {
  return (
    <svg
      className="lisi-logo"
      viewBox="0 0 100 86"
      role="img"
      aria-label="lisi"
    >
      <g fill="currentColor">
        <path d="M48 22C47 10 54 3 67 2c0 13-7 20-19 20Z" />
        <path d="M50 19 61 8" stroke="#faf8f3" strokeWidth="1.8" />
        <rect x="5" y="17" width="10" height="61" rx="5" />
        <rect x="24" y="33" width="10" height="45" rx="5" />
        <circle cx="29" cy="22" r="5.5" />
        <path d="M65 38c-5-4-10-6-16-4-7 2-10 8-9 15 1 6 6 9 12 11 5 2 7 3 6 6-1 4-8 4-14 0l-5 8c8 6 17 7 24 2 7-4 8-13 4-19-3-4-8-5-13-7-4-1-5-3-4-5 1-3 5-3 10 0Z" />
        <rect x="78" y="33" width="10" height="45" rx="5" />
        <circle cx="83" cy="22" r="5.5" />
      </g>
    </svg>
  );
}
