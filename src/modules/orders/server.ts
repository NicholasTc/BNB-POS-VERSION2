import { sql } from "drizzle-orm";
import { db } from "@/db";
import { AppError } from "@/lib/http";
import { cashierValid, lockedDevice, type Transaction } from "../attendance";
import type { OrderBoardState, OrderPage, PreparationOrder } from "./types";

export const ORDER_PAGE_SIZE = 20;
async function authorize(tx: Transaction, token: string) {
  const d = await lockedDevice(tx, token);
  if (!cashierValid(d))
    throw new AppError(401, "Masuk sebagai kasir untuk melihat pesanan.");
  const active = await tx.execute<{
    id: string;
    name: string;
    sessionId: string;
    openedAt: string;
  }>(sql`
    SELECT e.id,e.name,w.id AS "sessionId",w.opened_at AS "openedAt"
    FROM employee e JOIN attendance a ON a.employee_id=e.id
    JOIN work_session_shift m ON m.attendance_id=a.id
    JOIN work_session w ON w.id=m.session_id
    WHERE e.id=${d.cashierId} AND e.active AND a.clock_out IS NULL AND w.closed_at IS NULL`);
  if (!active.rows[0])
    throw new AppError(401, "Kasir tidak aktif. Masukkan PIN kembali.");
  return { ...active.rows[0], generation: d.generation };
}
type OrderRecord = Omit<PreparationOrder, "receivedAt" | "finishedAt"> & {
  receivedAt: string;
  finishedAt: string | null;
};
async function page(
  tx: Transaction,
  sessionId: string,
  finished: boolean,
  cursor?: string,
): Promise<OrderPage> {
  let boundary = sql``;
  if (cursor) {
    const found = await tx.execute<{
      receivedAt: string;
      finishedAt: string | null;
      sessionId: string | null;
    }>(sql`
      SELECT received_at AS "receivedAt",finished_at AS "finishedAt",finished_session_id AS "sessionId" FROM order_ticket WHERE sale_id=${cursor}`);
    const row = found.rows[0];
    if (!row || (finished && (!row.finishedAt || row.sessionId !== sessionId)))
      throw new AppError(
        400,
        "Daftar pesanan berubah. Buka halaman pertama kembali.",
      );
    boundary = finished
      ? sql`AND (t.finished_at,t.sale_id)<(${row.finishedAt},${cursor}::uuid)`
      : sql`AND (t.received_at,t.sale_id)>(${row.receivedAt},${cursor}::uuid)`;
  }
  const condition = finished
    ? sql`t.finished_session_id=${sessionId} AND t.finished_at IS NOT NULL`
    : sql`t.finished_at IS NULL`;
  const order = finished
    ? sql`t.finished_at DESC,t.sale_id DESC`
    : sql`t.received_at,t.sale_id`;
  const result = await tx.execute<OrderRecord>(sql`
    SELECT t.sale_id AS id,s.reference,s.cashier_name AS "cashierName",t.received_at AS "receivedAt",
      t.finished_at AS "finishedAt",t.finished_by_name AS "finishedByName",t.session_id<>${sessionId}::uuid AS "carriedOver",
      (SELECT jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity) ORDER BY l.id) FROM sale_line l WHERE l.sale_id=t.sale_id) AS lines
    FROM order_ticket t JOIN sale s ON s.id=t.sale_id WHERE ${condition} ${boundary}
    ORDER BY ${order} LIMIT ${ORDER_PAGE_SIZE + 1}`);
  const counts = await tx.execute<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM order_ticket t WHERE ${condition}`,
  );
  const rows = result.rows.slice(0, ORDER_PAGE_SIZE);
  return {
    orders: rows.map((r) => ({
      ...r,
      receivedAt: new Date(r.receivedAt).toISOString(),
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
    })),
    total: counts.rows[0].total,
    nextCursor: result.rows.length > ORDER_PAGE_SIZE ? rows.at(-1)!.id : null,
  };
}
export async function readOrders(
  token: string,
  cursors: { pendingAfter?: string; finishedBefore?: string } = {},
): Promise<OrderBoardState> {
  return db.transaction(async (tx) => {
    const cashier = await authorize(tx, token);
    return {
      session: {
        id: cashier.sessionId,
        openedAt: new Date(cashier.openedAt).toISOString(),
      },
      pending: await page(tx, cashier.sessionId, false, cursors.pendingAfter),
      finished: await page(tx, cashier.sessionId, true, cursors.finishedBefore),
    };
  });
}
export async function finishOrder(
  token: string,
  id: string,
  generation: number,
) {
  return db.transaction(async (tx) => {
    const cashier = await authorize(tx, token);
    if (cashier.generation !== generation)
      throw new AppError(409, "Kasir berubah. Periksa daftar pesanan kembali.");
    // Use this transaction's connection; waiting for a second pool connection
    // while holding the shared-device lock could deadlock under a request burst.
    const budget = await tx.execute<{
      count: number;
    }>(sql`INSERT INTO throttle (key,count,reset_at)
      VALUES ('order-finish',1,now()+interval '60 seconds') ON CONFLICT (key) DO UPDATE
      SET count=CASE WHEN throttle.reset_at<=now() THEN 1 ELSE throttle.count+1 END,
        reset_at=CASE WHEN throttle.reset_at<=now() THEN now()+interval '60 seconds' ELSE throttle.reset_at END RETURNING count`);
    if (budget.rows[0].count > 120)
      throw new AppError(
        429,
        "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
      );
    const found = await tx.execute<{ finishedAt: Date | null }>(
      sql`SELECT finished_at AS "finishedAt" FROM order_ticket WHERE sale_id=${id} FOR UPDATE`,
    );
    if (!found.rows[0]) throw new AppError(404, "Pesanan tidak ditemukan.");
    if (found.rows[0].finishedAt) return;
    await tx.execute(
      sql`UPDATE order_ticket SET finished_at=GREATEST(clock_timestamp(),received_at),finished_by=${cashier.id},finished_by_name=${cashier.name},finished_session_id=${cashier.sessionId} WHERE sale_id=${id}`,
    );
    await tx.execute(
      sql`INSERT INTO audit (actor,action,details) VALUES (${cashier.id},'order.finish',${JSON.stringify({ saleId: id, sessionId: cashier.sessionId })}::jsonb)`,
    );
  });
}
