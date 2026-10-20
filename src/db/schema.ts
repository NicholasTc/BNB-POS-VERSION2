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
export const user = pgTable(
  "owner_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(true),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("one_owner", sql`${t.id} = 'owner'`)],
);
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
export const rateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const throttle = pgTable("throttle", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
export const audit = pgTable("audit", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  details: jsonb("details").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
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
export const saleDiscount = pgTable("sale_discount", {
  saleId: uuid("sale_id")
    .primaryKey()
    .references(() => sale.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").$type<DiscountSnapshot>().notNull(),
});

// Optional export module. No credentials or financial snapshots live here.
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
    index("stock_item_history_idx").on(t.stockItemId, t.createdAt, t.id),
    check(
      "stock_movement_valid",
      sql`${t.kind} IN ('opening','restock','adjust','sale') AND ${t.delta} BETWEEN -9000000000000 AND 9000000000000 AND ${t.balanceAfter} BETWEEN -9000000000000 AND 9000000000000 AND length(${t.reason})<=200 AND ((${t.kind}='sale' AND ${t.saleId} IS NOT NULL AND ${t.operationId} IS NULL AND ${t.delta}<0 AND ${t.saleReference} IS NOT NULL) OR (${t.kind}<>'sale' AND ${t.saleId} IS NULL AND ${t.operationId} IS NOT NULL AND ${t.saleReference} IS NULL))`,
    ),
  ],
);
