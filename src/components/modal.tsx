"use client";
import { useEffect, useRef } from "react";
export function Modal({
  title,
  onClose,
  busy = false,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const sheet = className === "pos-payment-sheet";
    const scrollY = window.scrollY;
    const overflow = document.body.style.overflow;
    if (sheet) {
      window.scrollTo(0, 0);
      document.body.style.overflow = "hidden";
    }
    el?.showModal();
    return () => {
      el?.close();
      if (sheet) {
        document.body.style.overflow = overflow;
        window.scrollTo(0, scrollY);
      }
      previous?.focus();
    };
  }, [className]);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, a[href], [tabindex="0"]',
          ),
        ).filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="stack">
        <div className="row between">
          <h2>{title}</h2>
          <button className="secondary" onClick={onClose} disabled={busy}>
            Tutup
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
