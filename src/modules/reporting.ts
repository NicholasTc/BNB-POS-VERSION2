import { and, desc, eq, gte, lt, inArray, sql, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  sale,
  saleLine,
  saleDiscount,
  attendance,
  employee,
} from "@/db/schema";
import { businessRange } from "@/lib/dates";
import { AppError } from "@/lib/http";
const amount = (value: string | number) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Report exceeds safe integer range");
  return n;
};
export async function report(input: {
  from: string;
  to: string;
  salesPage: number;
  attendancePage: number;
}) {
  let range: ReturnType<typeof businessRange>;
  try {
    range = businessRange(input.from, input.to);
  } catch (e) {
    throw new AppError(400, (e as Error).message);
  }
  const { start, end } = range;
  const filter = and(
    eq(sale.status, "completed"),
    gte(sale.completedAt, start),
    lt(sale.completedAt, end),
  );
  return db.transaction(
    async (tx) => {
      const totals = await tx
        .select({
          revenue: sql<string>`COALESCE(sum(${sale.total}),0)`,
          salesCount: sql<string>`count(*)`,
        })
        .from(sale)
        .where(filter);
      const payments = await tx
        .select({
          method: sale.paymentMethod,
          total: sql<string>`sum(${sale.total})`,
          count: sql<string>`count(*)`,
        })
        .from(sale)
        .where(filter)
        .groupBy(sale.paymentMethod);
      const items = await tx.execute<{
        id: string;
        name: string;
        quantity: string;
        total: string;
      }>(
        sql`SELECT m.id,m.name,sum(l.quantity) AS quantity,
          sum(l.subtotal-COALESCE((SELECT (a->>'discount')::int FROM jsonb_array_elements(d.snapshot->'allocations') a WHERE a->>'id'=l.menu_item_id::text),0)) AS total
          FROM sale_line l JOIN sale s ON s.id=l.sale_id LEFT JOIN sale_discount d ON d.sale_id=s.id
          JOIN menu_item m ON m.id=l.menu_item_id WHERE s.status='completed' AND s.completed_at>=${start} AND s.completed_at<${end}
          GROUP BY m.id,m.name ORDER BY sum(l.quantity) DESC,m.name`,
      );
      const cashiers = await tx
        .select({
          id: employee.id,
          name: employee.name,
          total: sql<string>`sum(${sale.total})`,
          count: sql<string>`count(*)`,
        })
        .from(sale)
        .innerJoin(employee, eq(sale.cashierId, employee.id))
        .where(filter)
        .groupBy(employee.id, employee.name)
        .orderBy(employee.name);
      const history = await tx
        .select({
          id: sale.id,
          reference: sale.reference,
          cashierName: sale.cashierName,
          total: sale.total,
          paymentMethod: sale.paymentMethod,
          completedAt: sale.completedAt,
        })
        .from(sale)
        .where(filter)
        .orderBy(desc(sale.completedAt), desc(sale.id))
        .limit(25)
        .offset((input.salesPage - 1) * 25);
      const lines = history.length
        ? await tx
            .select({
              saleId: saleLine.saleId,
              name: saleLine.name,
              unitPrice: saleLine.unitPrice,
              quantity: saleLine.quantity,
              subtotal: saleLine.subtotal,
            })
            .from(saleLine)
            .where(
              inArray(
                saleLine.saleId,
                history.map((s) => s.id),
              ),
            )
        : [];
      const discounts = history.length
        ? await tx
            .select()
            .from(saleDiscount)
            .where(
              inArray(
                saleDiscount.saleId,
                history.map((s) => s.id),
              ),
            )
        : [];
      const attendanceFilter = and(
        lt(attendance.clockIn, end),
        or(isNull(attendance.clockOut), sql`${attendance.clockOut}>${start}`),
      );
      const shifts = await tx
        .select({
          id: attendance.id,
          name: employee.name,
          clockIn: attendance.clockIn,
          clockOut: attendance.clockOut,
        })
        .from(attendance)
        .innerJoin(employee, eq(employee.id, attendance.employeeId))
        .where(attendanceFilter)
        .orderBy(desc(attendance.clockIn), desc(attendance.id))
        .limit(25)
        .offset((input.attendancePage - 1) * 25);
      const shiftCount = await tx
        .select({ count: sql<string>`count(*)` })
        .from(attendance)
        .where(attendanceFilter);
      const open = await tx
        .select({
          id: sale.id,
          reference: sale.reference,
          cashierName: sale.cashierName,
          total: sale.total,
          status: sale.status,
          createdAt: sale.createdAt,
        })
        .from(sale)
        .where(inArray(sale.status, ["pending", "paid"]));
      return {
        from: input.from,
        to: input.to,
        summary: {
          revenue: amount(totals[0].revenue),
          salesCount: amount(totals[0].salesCount),
        },
        payments: payments.map((p) => ({
          ...p,
          total: amount(p.total),
          count: amount(p.count),
        })),
        items: items.rows.map((i) => ({
          ...i,
          total: amount(i.total),
          quantity: amount(i.quantity),
        })),
        cashiers: cashiers.map((c) => ({
          ...c,
          total: amount(c.total),
          count: amount(c.count),
        })),
        history: history.map((s) => ({
          ...s,
          lines: lines.filter((l) => l.saleId === s.id),
          discountSnapshot:
            discounts.find((d) => d.saleId === s.id)?.snapshot ?? null,
        })),
        attendance: shifts,
        attendanceCount: amount(shiftCount[0].count),
        salesPage: input.salesPage,
        attendancePage: input.attendancePage,
        open,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type Report = Awaited<ReturnType<typeof report>>;
