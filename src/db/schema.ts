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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
