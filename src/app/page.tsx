import { Pos } from "@/components/pos";
import { RoleEntry } from "@/components/role-entry";
export default async function Home({ searchParams }: { searchParams: Promise<{ access?: string; login?: string }> }) {
  const query = await searchParams;
  // Navigation hints only. Pos retains every server authorization/handoff check.
  return query.access === "cashier" ? <Pos initialLogin={query.login === "1"} /> : <RoleEntry />;
}
