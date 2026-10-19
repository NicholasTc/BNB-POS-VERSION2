import { sql } from "drizzle-orm";
import type { Transaction } from "../attendance";
import type { SessionFarewell } from "./types";

// Called inside the successful clock-out transaction, after its session trigger.
// No browser identity, totals or participant names are trusted.
export async function sessionFarewell(
  tx: Transaction,
  attendanceId: string,
): Promise<SessionFarewell | null> {
  const result = await tx.execute<{
    id: string;
    names: string[];
    productsSold: number;
    ordersSold: number;
    pendingOrders: number;
  }>(sql`
    SELECT w.id,
      ARRAY(SELECT member.employee_name FROM (
        SELECT DISTINCT ON (a.employee_id) m.employee_name,a.clock_in,a.employee_id
        FROM work_session_shift m JOIN attendance a ON a.id=m.attendance_id
        WHERE m.session_id=w.id ORDER BY a.employee_id,a.clock_in,a.id
      ) member ORDER BY member.clock_in,member.employee_id) AS names,
      (SELECT COALESCE(sum(l.quantity),0)::int FROM order_ticket t JOIN sale_line l ON l.sale_id=t.sale_id WHERE t.session_id=w.id) AS "productsSold",
      (SELECT count(*)::int FROM order_ticket WHERE session_id=w.id) AS "ordersSold",
      (SELECT count(*)::int FROM order_ticket WHERE finished_at IS NULL) AS "pendingOrders"
    FROM work_session w JOIN work_session_shift m ON m.session_id=w.id
    WHERE m.attendance_id=${attendanceId} AND w.closed_at IS NOT NULL`);
  return result.rows[0] ?? null;
}
