/**
 * Database map: route authorization → server modules → Drizzle transactions →
 * PostgreSQL constraints/triggers → immutable records and independent export metadata.
 * This file describes table structure; versioned drizzle/*.sql migrations also own
 * the trigger functions below. Do not edit an applied migration to change behavior.
 *
 * Functions verified against the local database definitions:
 * - protect_sale: preserves the quote/terminal snapshots and allowed status transitions.
 * - protect_sale_line: permits inserts for a pending parent only; blocks edits/deletes.
 * - protect_sale_discount: permits new quote allocations only in their creation
 *   transaction; later edits/deletes are rejected.
 * - check_sale_totals: deferred validation reconciles line gross, frozen discount
 *   allocations and payable total, including promo percentage/line-count bounds.
 * - capture_stock_usage: freezes the current recipe and supply units/names per new line.
 * - consume_sale_stock: first completion groups frozen usage into stock deductions.
 * - apply_stock_movement: validates each immutable movement against its sale or owner
 *   operation receipt, locks the stock row and advances balance/revision atomically.
 * - protect_stock_item: requires zero opening balance, immutable identity/unit and
 *   sequential revisions; stock balances change through validated movements only.
 * - guard_stock_recipe: serializes recipe changes, bounds lines and enforces revisions.
 * - protect_stock_usage / immutable_stock_operation: reject changes to frozen evidence.
 * - capture_work_session: first clock-in opens a session; last clock-out closes it;
 *   memberships preserve employee display names for the session summary.
 * - capture_preparation_order: completed payment with an active shift creates one
 *   preparation ticket in its work session; historical imports do not create tickets.
 * - lisi_queue_sheet_sale: completion enqueues the immutable sale for export.
 * - lisi_queue_sheet_attendance: inserts/clock-out changes advance export-job revision.
 * - lisi_queue_sheet_employee_name: name changes enqueue affected attendance records.
 *
 * These triggers execute inside the source transaction. Google I/O occurs later in
 * the Sheets worker; report caches and diagnostics never become financial authority.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  check,
  jsonb,
  uuid,
  uniqueIndex,
  index,
  pgEnum,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { PromoRules, DiscountSnapshot } from "@/modules/promos/rules";
/** Owner/admin identities and SQL role boundary; shared café records are not partitioned by owner login. */
export const user = pgTable(
  "owner_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(true),
    role: text("role").notNull().default("owner"),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "account_role",
      sql`${t.role} IN ('owner','admin') AND (${t.role}='admin')=(${t.id}='admin')`,
    ),
    uniqueIndex("account_email_ci").on(sql`lower(${t.email})`),
  ],
);
/** Durable administrator creation receipt links operation UUID, actor and created owner for retry safety. */
export const ownerCreation = pgTable(
  "owner_creation",
  {
    id: uuid("id").primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    ownerId: text("owner_id")
      .notNull()
      .unique()
      .references(() => user.id),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("owner_creation_hash", sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
  ],
);
/** Per-owner display language; separate from shared business data. */
export const ownerPreferences = pgTable(
  "owner_preferences",
  {
    ownerId: text("owner_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    language: text("language").notNull().default("id"),
  },
  (t) => [check("owner_language", sql`${t.language} IN ('id','en')`)],
);
/** Server-side owner/admin sessions; role, expiry and idle checks remain authorization requirements. */
export const session = pgTable("owner_session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
/** Better Auth credential records linked to identities; password hashes are never listing fields. */
export const account = pgTable("owner_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
/** Better Auth verification material; server-side authentication metadata only. */
export const verification = pgTable("owner_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
/** Authentication library rate-limit state. */
export const rateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
/** Application SQL request/action budgets shared across server instances. */
export const throttle = pgTable("throttle", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
/** Security/action audit trail; distinct from sanitized operational diagnostics. */
export const audit = pgTable("audit", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  details: jsonb("details").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
/** Staff identity and protected four-digit PIN verification material; no owner role. */
export const employee = pgTable(
  "employee",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    pinHash: text("pin_hash").notNull(),
    pinLookup: text("pin_lookup").notNull().unique(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("employee_name_length", sql`length(${t.name}) BETWEEN 1 AND 80`),
  ],
);
/** Clock-in/out evidence; transitions and work-session capture are atomic. */
export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employee.id),
    clockIn: timestamp("clock_in", { withTimezone: true })
      .notNull()
      .defaultNow(),
    clockOut: timestamp("clock_out", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("one_active_shift")
      .on(t.employeeId)
      .where(sql`${t.clockOut} IS NULL`),
    index("attendance_date_idx").on(t.clockIn),
    check(
      "valid_shift",
      sql`${t.clockOut} IS NULL OR ${t.clockOut} >= ${t.clockIn}`,
    ),
  ],
);
/** Single shared cashier authority: hashed pairing, expiry and current cashier state. */
export const device = pgTable(
  "device",
  {
    id: text("id").primaryKey().default("shared"),
    tokenHash: text("token_hash").unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    cashierId: uuid("cashier_id").references(() => employee.id),
    touchedAt: timestamp("touched_at", { withTimezone: true }),
    generation: integer("generation").notNull().default(0),
  },
  (t) => [check("one_device", sql`${t.id} = 'shared'`)],
);
/** Current catalogue/prices/categories; completed sales retain their own historical snapshots. */
export const menuItem = pgTable(
  "menu_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    category: text("category").notNull().default("uncategorized"),
    imageUrl: text("image_url").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("menu_name_length", sql`length(${t.name}) BETWEEN 1 AND 80`),
    check("menu_price_range", sql`${t.price} BETWEEN 1 AND 100000000`),
    check(
      "menu_category",
      sql`${t.category} IN ('uncategorized','drink','food')`,
    ),
    check("menu_image_length", sql`length(${t.imageUrl}) <= 2000`),
  ],
);
export const paymentMethod = pgEnum("payment_method", ["cash", "qris"]);
// Owner rules are mutable; each issued quote has a separate immutable snapshot.
/** Owner-configured current promo rules/order; quotes freeze the applied rules and allocations. */
export const promotion = pgTable(
  "promotion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rules: jsonb("rules").$type<PromoRules>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("promotion_revision", sql`${t.revision}>0`)],
);
export const saleStatus = pgEnum("sale_status", [
  "pending",
  "paid",
  "completed",
  "cancelled",
]);
/** Durable payment operation and status machine; UUID retries preserve the original quote. */
export const sale = pgTable(
  "sale",
  {
    id: uuid("id").primaryKey(),
    reference: text("reference").notNull().unique(),
    deviceId: text("device_id")
      .notNull()
      .references(() => device.id),
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => employee.id),
    cashierName: text("cashier_name").notNull(),
    requestHash: text("request_hash").notNull(),
    status: saleStatus("status").notNull().default("pending"),
    paymentMethod: paymentMethod("payment_method").notNull(),
    total: integer("total").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    attestedAt: timestamp("attested_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("one_open_sale_per_device")
      .on(t.deviceId)
      .where(sql`${t.status} IN ('pending','paid')`),
    index("sale_completed_idx").on(t.completedAt),
    index("sale_cashier_idx").on(t.cashierId),
    check("sale_total_range", sql`${t.total} BETWEEN 1 AND 1000000000`),
    check(
      "sale_status_timestamps",
      sql`(${t.status} IN ('pending','cancelled') AND ${t.attestedAt} IS NULL AND ${t.completedAt} IS NULL) OR (${t.status}='paid' AND ${t.attestedAt} IS NOT NULL AND ${t.completedAt} IS NULL) OR (${t.status}='completed' AND ${t.attestedAt} IS NOT NULL AND ${t.completedAt} IS NOT NULL AND ${t.completedAt} >= ${t.attestedAt})`,
    ),
  ],
);
/** Immutable purchased names/prices/quantities tied to the parent sale. */
export const saleLine = pgTable(
  "sale_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sale.id),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItem.id),
    name: text("name").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    subtotal: integer("subtotal").notNull(),
  },
  (t) => [
    unique("one_product_per_sale").on(t.saleId, t.menuItemId),
    check("sale_line_quantity", sql`${t.quantity} BETWEEN 1 AND 99`),
    check("sale_line_price", sql`${t.unitPrice} BETWEEN 1 AND 100000000`),
    check(
      "sale_line_subtotal",
      sql`${t.subtotal}::bigint = ${t.unitPrice}::bigint * ${t.quantity} AND ${t.subtotal} BETWEEN 1 AND 1000000000`,
    ),
  ],
);
/** Frozen per-promo discount evidence and per-line allocations for exact reconciliation. */
export const saleDiscount = pgTable("sale_discount", {
  saleId: uuid("sale_id")
    .primaryKey()
    .references(() => sale.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").$type<DiscountSnapshot>().notNull(),
});

// Optional export module. No credentials or financial snapshots live here.
/** Durable sale/attendance export queue; retries are independent of checkout. */
export const sheetsJob = pgTable(
  "sheets_sync_job",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    kind: text("kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    saleId: uuid("sale_id").references(() => sale.id, { onDelete: "cascade" }),
    attendanceId: uuid("attendance_id").references(() => attendance.id, {
      onDelete: "cascade",
    }),
    revision: integer("revision").notNull().default(1),
    syncedRevision: integer("synced_revision").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("sheets_source").on(t.kind, t.sourceId),
    check(
      "sheets_job_source",
      sql`(${t.kind}='sale' AND ${t.sourceId}=${t.saleId} AND ${t.saleId} IS NOT NULL AND ${t.attendanceId} IS NULL) OR (${t.kind}='attendance' AND ${t.sourceId}=${t.attendanceId} AND ${t.attendanceId} IS NOT NULL AND ${t.saleId} IS NULL)`,
    ),
    check(
      "sheets_job_versions",
      sql`${t.revision}>0 AND ${t.syncedRevision}>=0 AND ${t.syncedRevision}<=${t.revision} AND ${t.attempts}>=0`,
    ),
    index("sheets_due")
      .on(t.nextAttemptAt)
      .where(sql`${t.syncedRevision}<${t.revision}`),
  ],
);
/** Reserved destination row/receipt metadata supports retries without duplicate spreadsheet rows. */
export const sheetsRow = pgTable(
  "sheets_sync_row",
  {
    tab: text("tab").notNull(),
    sourceId: uuid("source_id").notNull(),
    jobId: bigint("job_id", { mode: "number" })
      .notNull()
      .references(() => sheetsJob.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tab, t.sourceId] }),
    unique("sheets_row_position").on(t.tab, t.rowNumber),
    check(
      "sheets_row_valid",
      sql`${t.rowNumber}>=2 AND ${t.tab} IN ('Sales','Sale items','Attendance')`,
    ),
  ],
);
/** Core export destination, worker heartbeat and delivery status; not Google credentials. */
export const sheetsTarget = pgTable(
  "sheets_sync_target",
  {
    id: text("id").primaryKey().default("primary"),
    spreadsheetId: text("spreadsheet_id").notNull(),
    mode: text("mode").notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "sheets_target_valid",
      sql`${t.id}='primary' AND ${t.mode} IN ('test','live')`,
    ),
  ],
);

// Preparation is separate from the immutable financial sale state.
/** Open/closed café work period derived from attendance for preparation/history and summaries. */
export const workSession = pgTable(
  "work_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    openingAttendanceId: uuid("opening_attendance_id")
      .notNull()
      .unique()
      .references(() => attendance.id, { onDelete: "cascade" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("one_open_work_session")
      .on(sql`(true)`)
      .where(sql`${t.closedAt} IS NULL`),
    check(
      "valid_work_session",
      sql`${t.closedAt} IS NULL OR ${t.closedAt}>=${t.openedAt}`,
    ),
  ],
);
/** Attendance membership and frozen employee name within a work session. */
export const sessionShift = pgTable(
  "work_session_shift",
  {
    attendanceId: uuid("attendance_id")
      .primaryKey()
      .references(() => attendance.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workSession.id, { onDelete: "cascade" }),
    employeeName: text("employee_name").notNull(),
  },
  (t) => [index("session_shift_session_idx").on(t.sessionId)],
);
/** Paid-order preparation/completion state, separate from financial sale status. */
export const orderTicket = pgTable(
  "order_ticket",
  {
    saleId: uuid("sale_id")
      .primaryKey()
      .references(() => sale.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workSession.id, { onDelete: "cascade" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    finishedBy: uuid("finished_by").references(() => employee.id),
    finishedByName: text("finished_by_name"),
    finishedSessionId: uuid("finished_session_id").references(
      () => workSession.id,
      { onDelete: "cascade" },
    ),
  },
  (t) => [
    index("order_session_idx").on(t.sessionId),
    index("order_pending_idx")
      .on(t.receivedAt, t.saleId)
      .where(sql`${t.finishedAt} IS NULL`),
    index("order_finished_idx")
      .on(t.finishedSessionId, t.finishedAt, t.saleId)
      .where(sql`${t.finishedAt} IS NOT NULL`),
    check(
      "valid_order_finish",
      sql`(${t.finishedAt} IS NULL AND ${t.finishedBy} IS NULL AND ${t.finishedByName} IS NULL AND ${t.finishedSessionId} IS NULL) OR (${t.finishedAt} IS NOT NULL AND ${t.finishedAt}>=${t.receivedAt} AND ${t.finishedBy} IS NOT NULL AND ${t.finishedByName} IS NOT NULL AND ${t.finishedSessionId} IS NOT NULL)`,
    ),
  ],
);

// Optional stock module: immutable quote usage and append-only movements.
/** Supply catalogue, unit, movement-derived balance and concurrency revision. */
export const stockItem = pgTable(
  "stock_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    balance: bigint("balance", { mode: "number" }).notNull().default(0),
    lowThreshold: integer("low_threshold").notNull().default(0),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [
    uniqueIndex("stock_item_name_unique").on(sql`lower(btrim(${t.name}))`),
    check(
      "stock_item_valid",
      sql`length(btrim(${t.name})) BETWEEN 1 AND 80 AND ${t.unit} IN ('pcs','pack') AND ${t.lowThreshold} BETWEEN 0 AND 1000000000 AND ${t.revision}>0 AND ${t.balance} BETWEEN -9000000000000 AND 9000000000000`,
    ),
  ],
);
/** Versioned menu-to-supply recipe header. */
export const stockRecipe = pgTable(
  "stock_recipe",
  {
    menuItemId: uuid("menu_item_id")
      .primaryKey()
      .references(() => menuItem.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
  },
  (t) => [check("stock_recipe_revision", sql`${t.revision}>0`)],
);
/** Supply units consumed per menu unit for the current recipe. */
export const stockRecipeLine = pgTable(
  "stock_recipe_line",
  {
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => stockRecipe.menuItemId, { onDelete: "cascade" }),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItem.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.menuItemId, t.stockItemId] }),
    check("stock_recipe_quantity", sql`${t.quantity} BETWEEN 1 AND 1000000`),
  ],
);
/** Frozen recipe usage per sale line; later recipe edits cannot rewrite deductions. */
export const stockUsage = pgTable(
  "stock_usage",
  {
    saleLineId: uuid("sale_line_id")
      .notNull()
      .references(() => saleLine.id, { onDelete: "cascade" }),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItem.id),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    perUnit: integer("per_unit").notNull(),
    quantity: integer("quantity").notNull(),
    recipeRevision: integer("recipe_revision").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.saleLineId, t.stockItemId] }),
    check(
      "stock_usage_valid",
      sql`${t.perUnit} BETWEEN 1 AND 1000000 AND ${t.quantity} BETWEEN 1 AND 99000000 AND ${t.recipeRevision}>0`,
    ),
  ],
);
/** Idempotent owner restock/adjustment receipt; immutable once written. */
export const stockOperation = pgTable("stock_operation", {
  id: uuid("id").primaryKey(),
  requestHash: text("request_hash").notNull(),
  result: jsonb("result")
    .$type<import("@/modules/stock/types").StockResult>()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
/** Immutable supply ledger; validated inserts atomically update supply balances. */
export const stockMovement = pgTable(
  "stock_movement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItem.id),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    kind: text("kind").notNull(),
    delta: bigint("delta", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    actor: text("actor").notNull(),
    saleId: uuid("sale_id").references(() => sale.id, { onDelete: "cascade" }),
    saleReference: text("sale_reference"),
    operationId: uuid("operation_id").references(() => stockOperation.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("stock_sale_once").on(t.saleId, t.stockItemId),
    unique("stock_operation_once").on(t.operationId),
    index("stock_history_idx").on(t.createdAt, t.id),
    // Alerts inspect the last delivery/count without scanning sale deductions.
    index("alerts_stock_restock_idx")
      .on(t.stockItemId, t.createdAt, t.id)
      .where(sql`${t.kind}<>'sale'`),
    index("stock_item_history_idx").on(t.stockItemId, t.createdAt, t.id),
    check(
      "stock_movement_valid",
      sql`${t.kind} IN ('opening','restock','adjust','sale') AND ${t.delta} BETWEEN -9000000000000 AND 9000000000000 AND ${t.balanceAfter} BETWEEN -9000000000000 AND 9000000000000 AND length(${t.reason})<=200 AND ((${t.kind}='sale' AND ${t.saleId} IS NOT NULL AND ${t.operationId} IS NULL AND ${t.delta}<0 AND ${t.saleReference} IS NOT NULL) OR (${t.kind}<>'sale' AND ${t.saleId} IS NULL AND ${t.operationId} IS NOT NULL AND ${t.saleReference} IS NULL))`,
    ),
  ],
);

// Owner alert episodes/preferences only; no hooks or writes to business records.
/** Persistent owner acknowledgment/snooze state; source rules determine actual resolution. */
export const ownerAlertState = pgTable(
  "owner_alert_state",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    version: integer("version").notNull().default(1),
    active: boolean("active").notNull().default(true),
    disposition: text("disposition").notNull().default("none"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.key] }),
    check(
      "owner_alert_valid",
      sql`${t.key} IN ('categories','stock-low','stock-negative','sheets','payment-pending','payment-paid') AND ${t.version}>0 AND ${t.disposition} IN ('none','dismissed','snoozed','acknowledged') AND ((${t.disposition}='snoozed' AND ${t.snoozedUntil} IS NOT NULL) OR (${t.disposition}<>'snoozed' AND ${t.snoozedUntil} IS NULL))`,
    ),
  ],
);

// Independent daily-report projection; no triggers on business tables.
/** Independent report destination/publication coordination and worker error/backoff metadata. */
export const dailyReportTarget = pgTable(
  "sheets_daily_target",
  {
    id: text("id").primaryKey().default("primary"),
    spreadsheetId: text("spreadsheet_id").notNull(),
    mode: text("mode").notNull(),
    sheetId: integer("sheet_id"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "daily_target_valid",
      sql`${t.id}='primary' AND ${t.mode} IN ('test','live') AND ${t.attempts}>=0`,
    ),
  ],
);
/** Per-Jakarta-day catalogue snapshot and dirty/revision state for report projection. */
export const dailyReportDay = pgTable(
  "sheets_daily_day",
  {
    date: text("date").primaryKey(),
    saleCount: integer("sale_count").notNull(),
    catalog: jsonb("catalog")
      .$type<import("@/modules/daily-report/types").CatalogItem[]>()
      .notNull(),
    catalogHash: text("catalog_hash").notNull(),
    statusRow: integer("status_row").notNull().unique(),
    dirty: boolean("dirty").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    catalogHistorical: boolean("catalog_historical").notNull().default(false),
  },
  (t) => [
    check(
      "daily_day_valid",
      sql`${t.date} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND ${t.saleCount}>=0 AND ${t.statusRow}>=6`,
    ),
  ],
);
/** Stable cached report rows reserved for each day; financial values come from source snapshots. */
export const dailyReportRow = pgTable(
  "sheets_daily_row",
  {
    key: text("key").primaryKey(),
    date: text("date")
      .notNull()
      .references(() => dailyReportDay.date, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull().unique(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    check(
      "daily_row_valid",
      sql`${t.key} ~ '^[a-f0-9]{64}$' AND ${t.rowNumber} BETWEEN 6 AND 100005`,
    ),
    index("daily_row_day_idx").on(t.date),
  ],
);

// Upload lifecycle only. Menu references remain in the existing image_url field.
/** Private image object metadata and immutable URLs; image bytes live in separate storage. */
export const menuPhotoAsset = pgTable(
  "menu_photo_asset",
  {
    id: uuid("id").primaryKey(),
    inputHash: text("input_hash").notNull(),
    contentHash: text("content_hash").notNull(),
    bytes: integer("bytes").notNull(),
    mode: text("mode").notNull(),
    target: text("target").notNull(),
    state: text("state").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    touchedAt: timestamp("touched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "menu_photo_valid",
      sql`${t.mode} IN ('local','s3') AND ${t.state} IN ('pending','ready','deleting','deleted') AND ${t.bytes} BETWEEN 1 AND 500000 AND ${t.inputHash} ~ '^[a-f0-9]{64}$' AND ${t.contentHash} ~ '^[a-f0-9]{64}$' AND ${t.target} ~ '^[a-f0-9]{64}$'`,
    ),
    index("menu_photo_cleanup_idx").on(t.state, t.touchedAt),
  ],
);

// Diagnostic metadata is independent of business/auth tables; expiry or deletion
// of an incident can never cascade into a sale, account, attendance or stock row.
/** Grouped sanitized operational failures; no foreign keys to business/authentication tables. */
export const diagnosticIssue = pgTable(
  "diagnostic_issue",
  {
    id: uuid("id").primaryKey(),
    fingerprint: text("fingerprint").notNull().unique(),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    severity: text("severity").notNull(),
    path: text("path").notNull(),
    method: text("method").notNull(),
    release: text("release").notNull(),
    httpStatus: integer("http_status"),
    errorKind: text("error_kind").notNull(),
    technicalCode: text("technical_code"),
    state: text("state").notNull().default("open"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    occurrences: integer("occurrences").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  t => [
    check("diagnostic_issue_valid", sql`${t.fingerprint} ~ '^[a-f0-9]{64}$' AND ${t.kind} IN ('request_failed','database_connection','server_render','browser_crash','browser_request','cashier_load','sheets_sync','daily_report') AND ${t.source} IN ('server','browser','worker') AND ${t.severity} IN ('error','warning') AND ${t.state} IN ('open','resolved') AND ${t.occurrences} BETWEEN 0 AND 1000000000 AND ${t.revision} BETWEEN 0 AND 1000000000 AND length(${t.path})<=100 AND length(${t.method})<=10 AND length(${t.release})<=40 AND length(${t.errorKind})<=32 AND (${t.technicalCode} IS NULL OR length(${t.technicalCode})<=40) AND (${t.httpStatus} IS NULL OR ${t.httpStatus} BETWEEN 400 AND 599)`),
    index("diagnostic_issue_feed_idx").on(t.state, t.lastSeenAt, t.id),
    index("diagnostic_issue_source_idx").on(t.source, t.lastSeenAt),
  ],
);

// Retained occurrence references point only to diagnostic issues. Frames contain
// allowlisted code locations, never error messages, headers or request payloads.
/** Bounded sanitized occurrence references/stack locations; references diagnostic groups only. */
export const diagnosticEventRow = pgTable(
  "diagnostic_event",
  {
    id: uuid("id").primaryKey(),
    issueId: uuid("issue_id").notNull().references(() => diagnosticIssue.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull(),
    frames: jsonb("frames").$type<string[]>().notNull().default([]),
  },
  t => [
    check("diagnostic_event_frames", sql`jsonb_typeof(${t.frames})='array' AND jsonb_array_length(${t.frames})<=5 AND octet_length(${t.frames}::text)<=1500`),
    index("diagnostic_event_issue_idx").on(t.issueId, t.at),
    index("diagnostic_event_retention_idx").on(t.at, t.id),
  ],
);
