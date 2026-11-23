"use client";
import { ErrorRecovery } from "@/components/error-recovery";
import "./globals.css";

/** Root-layout recovery keeps a valid document even when the normal layout cannot render. */
export default function GlobalError(props: { error: Error; reset: () => void }) {
  return <html lang="id"><body><ErrorRecovery {...props} /></body></html>;
}
