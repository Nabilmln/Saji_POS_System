import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "bigint" }).notNull();

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    // The FK to neon_auth.user(id) is added in the migration; Neon owns that table.
    userId: uuid("user_id").primaryKey(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    role: varchar("role", { length: 12 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check("staff_profiles_role_check", sql`${table.role} IN ('ADMIN', 'CASHIER')`)],
);

export const diningTables = pgTable(
  "dining_tables",
  {
    id: id(),
    tableNumber: varchar("table_number", { length: 30 }).notNull().unique(),
    qrToken: varchar("qr_token", { length: 128 }).notNull().unique(),
    status: varchar("status", { length: 12 }).notNull().default("AVAILABLE"),
    cycleNumber: integer("cycle_number").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("dining_tables_status_check", sql`${table.status} IN ('AVAILABLE', 'OCCUPIED', 'RESERVED')`),
    check("dining_tables_cycle_check", sql`${table.cycleNumber} >= 0`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    name: varchar("name", { length: 120 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("categories_name_lower_uniq").on(sql`lower(${table.name})`)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: id(),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    priceIdr: money("price_idr"),
    isAvailable: boolean("is_available").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("menu_items_price_check", sql`${table.priceIdr} >= 0`),
    index("menu_items_catalog_idx")
      .on(table.categoryId, table.isAvailable)
      .where(sql`archived_at IS NULL`),
  ],
);

export const storeSettings = pgTable(
  "store_settings",
  {
    id: smallint("id").primaryKey().default(1),
    storeName: varchar("store_name", { length: 200 }).notNull().default("Restaurant POS Demo"),
    discountEnabled: boolean("discount_enabled").notNull().default(false),
    discountAmountIdr: money("discount_amount_idr").default(sql`0`),
    taxEnabled: boolean("tax_enabled").notNull().default(false),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    version: bigint("version", { mode: "bigint" }).notNull().default(sql`1`),
    updatedByUserId: uuid("updated_by_user_id").references(() => staffProfiles.userId, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("store_settings_singleton_check", sql`${table.id} = 1`),
    check("store_settings_discount_check", sql`${table.discountAmountIdr} >= 0`),
    check("store_settings_tax_rate_check", sql`${table.taxRateBps} BETWEEN 0 AND 10000`),
    check("store_settings_version_check", sql`${table.version} >= 1`),
  ],
);

export const tableSessions = pgTable(
  "table_sessions",
  {
    id: id(),
    tableId: uuid("table_id").notNull().references(() => diningTables.id, { onDelete: "restrict" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    openedByUserId: uuid("opened_by_user_id").references(() => staffProfiles.userId, { onDelete: "set null" }),
    billRevision: bigint("bill_revision", { mode: "bigint" }).notNull().default(sql`1`),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closureReason: varchar("closure_reason", { length: 12 }),
    closedByUserId: uuid("closed_by_user_id").references(() => staffProfiles.userId, { onDelete: "set null" }),
  },
  (table) => [
    check("table_sessions_revision_check", sql`${table.billRevision} >= 1`),
    check("table_sessions_reason_check", sql`${table.closureReason} IN ('PAID', 'ALL_VOID')`),
    check("table_sessions_closed_check", sql`(${table.closedAt} IS NULL AND ${table.closureReason} IS NULL) OR (${table.closedAt} IS NOT NULL AND ${table.closureReason} IS NOT NULL)`),
    check("table_sessions_closed_time_check", sql`${table.closedAt} IS NULL OR ${table.closedAt} >= ${table.openedAt}`),
    uniqueIndex("table_sessions_one_active_per_table")
      .on(table.tableId)
      .where(sql`closed_at IS NULL`),
    index("table_sessions_table_history_idx").on(table.tableId, table.openedAt.desc()),
  ],
);

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    tableId: uuid("table_id").notNull().references(() => diningTables.id, { onDelete: "restrict" }),
    customerName: varchar("customer_name", { length: 120 }).notNull(),
    customerContact: varchar("customer_contact", { length: 80 }),
    guestCount: integer("guest_count").notNull(),
    reservedFor: timestamp("reserved_for", { withTimezone: true }).notNull(),
    notes: text("notes"),
    status: varchar("status", { length: 16 }).notNull().default("RESERVED"),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => staffProfiles.userId),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("reservations_customer_name_check", sql`length(btrim(${table.customerName})) > 0`),
    check("reservations_guest_count_check", sql`${table.guestCount} > 0`),
    check("reservations_status_check", sql`${table.status} IN ('RESERVED', 'CHECKED_IN', 'CANCELLED')`),
    uniqueIndex("reservations_one_reserved_per_table")
      .on(table.tableId)
      .where(sql`status = 'RESERVED'`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    sessionId: uuid("session_id").notNull().references(() => tableSessions.id, { onDelete: "restrict" }),
    customerName: varchar("customer_name", { length: 120 }).notNull(),
    source: varchar("source", { length: 10 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("PENDING"),
    note: text("note"),
    clientRequestKey: uuid("client_request_key").notNull().unique(),
    requestFingerprint: text("request_fingerprint").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => staffProfiles.userId, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => staffProfiles.userId, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("orders_customer_name_check", sql`length(btrim(${table.customerName})) > 0`),
    check("orders_source_check", sql`${table.source} IN ('QR', 'MANUAL')`),
    check("orders_status_check", sql`${table.status} IN ('PENDING', 'PREPARING', 'SERVED')`),
    check("orders_fingerprint_check", sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("orders_creator_check", sql`(${table.source} = 'MANUAL' AND ${table.createdByUserId} IS NOT NULL) OR (${table.source} = 'QR' AND ${table.createdByUserId} IS NULL)`),
    index("orders_session_created_idx").on(table.sessionId, table.createdAt),
    index("orders_status_created_idx")
      .on(table.status, table.createdAt)
      .where(sql`voided_at IS NULL`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    menuItemId: uuid("menu_item_id").references(() => menuItems.id, { onDelete: "set null" }),
    menuNameSnapshot: varchar("menu_name_snapshot", { length: 160 }).notNull(),
    unitPriceIdr: money("unit_price_idr"),
    quantity: integer("quantity").notNull(),
    lineTotalIdr: bigint("line_total_idr", { mode: "bigint" }).generatedAlwaysAs(sql`unit_price_idr * quantity`),
    customerNote: text("customer_note"),
    servedAt: timestamp("served_at", { withTimezone: true }),
    servedByUserId: uuid("served_by_user_id").references(() => staffProfiles.userId, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: uuid("voided_by_user_id").references(() => staffProfiles.userId, { onDelete: "set null" }),
    voidReasonType: varchar("void_reason_type", { length: 20 }),
    voidReasonDetail: text("void_reason_detail"),
  },
  (table) => [
    check("order_items_price_check", sql`${table.unitPriceIdr} >= 0`),
    check("order_items_quantity_check", sql`${table.quantity} > 0`),
    check("order_items_void_type_check", sql`${table.voidReasonType} IN ('CUSTOMER_REQUEST', 'EMPLOYEE_ERROR')`),
    check("order_items_void_metadata_check", sql`(${table.voidedAt} IS NULL AND ${table.voidReasonType} IS NULL AND ${table.voidReasonDetail} IS NULL AND ${table.voidedByUserId} IS NULL) OR (${table.voidedAt} IS NOT NULL AND ${table.voidReasonType} IS NOT NULL AND ${table.voidReasonDetail} IS NOT NULL AND length(btrim(${table.voidReasonDetail})) > 0 AND ${table.voidedByUserId} IS NOT NULL)`),
    check("order_items_served_metadata_check", sql`(${table.servedAt} IS NULL AND ${table.servedByUserId} IS NULL) OR (${table.servedAt} IS NOT NULL AND ${table.servedByUserId} IS NOT NULL)`),
    check("order_items_served_void_check", sql`${table.voidedAt} IS NULL OR ${table.servedAt} IS NULL OR ${table.voidReasonType} = 'EMPLOYEE_ERROR'`),
    index("order_items_order_idx").on(table.orderId),
    index("order_items_menu_idx").on(table.menuItemId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    sessionId: uuid("session_id").notNull().unique().references(() => tableSessions.id, { onDelete: "restrict" }),
    cashierUserId: uuid("cashier_user_id").notNull().references(() => staffProfiles.userId, { onDelete: "restrict" }),
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
    method: varchar("method", { length: 8 }).notNull().default("CASH"),
    subtotalIdr: money("subtotal_idr"),
    discountEnabled: boolean("discount_enabled").notNull(),
    configuredDiscountIdr: money("configured_discount_idr"),
    discountAppliedIdr: money("discount_applied_idr"),
    taxEnabled: boolean("tax_enabled").notNull(),
    taxRateBps: integer("tax_rate_bps").notNull(),
    taxAmountIdr: money("tax_amount_idr"),
    grandTotalIdr: money("grand_total_idr"),
    cashReceivedIdr: money("cash_received_idr"),
    changeIdr: money("change_idr"),
    sessionRevision: bigint("session_revision", { mode: "bigint" }).notNull(),
    settingsVersion: bigint("settings_version", { mode: "bigint" }).notNull(),
    receiptSnapshot: jsonb("receipt_snapshot").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("payments_method_check", sql`${table.method} = 'CASH'`),
    check("payments_subtotal_check", sql`${table.subtotalIdr} >= 0`),
    check("payments_configured_discount_check", sql`${table.configuredDiscountIdr} >= 0`),
    check("payments_applied_discount_check", sql`${table.discountAppliedIdr} >= 0 AND ${table.discountAppliedIdr} <= ${table.subtotalIdr}`),
    check("payments_tax_rate_check", sql`${table.taxRateBps} BETWEEN 0 AND 10000`),
    check("payments_tax_amount_check", sql`${table.taxAmountIdr} >= 0`),
    check("payments_total_check", sql`${table.grandTotalIdr} >= 0 AND ${table.grandTotalIdr} = ${table.subtotalIdr} - ${table.discountAppliedIdr} + ${table.taxAmountIdr}`),
    check("payments_cash_check", sql`${table.cashReceivedIdr} >= ${table.grandTotalIdr}`),
    check("payments_change_check", sql`${table.changeIdr} >= 0 AND ${table.changeIdr} = ${table.cashReceivedIdr} - ${table.grandTotalIdr}`),
    index("payments_paid_at_idx").on(table.paidAt.desc()),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => staffProfiles.userId, { onDelete: "set null" }),
    actorType: varchar("actor_type", { length: 10 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id"),
    tableId: uuid("table_id").references(() => diningTables.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => tableSessions.id, { onDelete: "set null" }),
    reason: text("reason"),
    details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (table) => [
    check("audit_events_actor_type_check", sql`${table.actorType} IN ('CUSTOMER', 'STAFF', 'SYSTEM')`),
    check("audit_events_staff_actor_check", sql`${table.actorType} <> 'STAFF' OR ${table.actorUserId} IS NOT NULL`),
    index("audit_session_time_idx").on(table.sessionId, table.createdAt.desc()),
    index("audit_entity_time_idx").on(table.entityType, table.entityId, table.createdAt.desc()),
  ],
);
