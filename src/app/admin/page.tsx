import type { Metadata } from "next";
import { AccountManager } from "@/components/account-manager";
import "./admin.css";
export const metadata: Metadata = {
  title: "Account manager | LISI",
  robots: { index: false, follow: false },
};
export default function AdminPage() {
  return <AccountManager />;
}
