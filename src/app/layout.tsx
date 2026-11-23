import type { Metadata } from "next";
import "./globals.css";
import { BrowserDiagnostics } from "@/components/browser-diagnostics";
import { diagnosticRelease } from "@/modules/diagnostics/safe";
export const metadata: Metadata = {
  title: "BNB POS — Bites and Blends",
  description: "Kasir sederhana untuk hari yang menyenangkan.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <BrowserDiagnostics enabled={process.env.DIAGNOSTICS_ENABLED !== "false"} release={diagnosticRelease(process.env.RAILWAY_GIT_COMMIT_SHA)} />
        {children}
      </body>
    </html>
  );
}
