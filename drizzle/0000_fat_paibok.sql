CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" varchar(10) NOT NULL,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid,
	"table_id" uuid,
	"session_id" uuid,
	"reason" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_actor_type_check" CHECK ("audit_events"."actor_type" IN ('CUSTOMER', 'STAFF', 'SYSTEM')),
	CONSTRAINT "audit_events_staff_actor_check" CHECK ("audit_events"."actor_type" <> 'STAFF' OR "audit_events"."actor_user_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_number" varchar(30) NOT NULL,
	"qr_token" varchar(128) NOT NULL,
	"status" varchar(12) DEFAULT 'AVAILABLE' NOT NULL,
	"cycle_number" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dining_tables_table_number_unique" UNIQUE("table_number"),
	CONSTRAINT "dining_tables_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "dining_tables_status_check" CHECK ("dining_tables"."status" IN ('AVAILABLE', 'OCCUPIED', 'RESERVED')),
	CONSTRAINT "dining_tables_cycle_check" CHECK ("dining_tables"."cycle_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"image_url" text,
	"price_idr" bigint NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_price_check" CHECK ("menu_items"."price_idr" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid,
	"menu_name_snapshot" varchar(160) NOT NULL,
	"unit_price_idr" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_idr" bigint GENERATED ALWAYS AS (unit_price_idr * quantity) STORED,
	"customer_note" text,
	"served_at" timestamp with time zone,
	"served_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason_type" varchar(20),
	"void_reason_detail" text,
	CONSTRAINT "order_items_price_check" CHECK ("order_items"."unit_price_idr" >= 0),
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_void_type_check" CHECK ("order_items"."void_reason_type" IN ('CUSTOMER_REQUEST', 'EMPLOYEE_ERROR')),
	CONSTRAINT "order_items_void_metadata_check" CHECK (("order_items"."voided_at" IS NULL AND "order_items"."void_reason_type" IS NULL AND "order_items"."void_reason_detail" IS NULL AND "order_items"."voided_by_user_id" IS NULL) OR ("order_items"."voided_at" IS NOT NULL AND "order_items"."void_reason_type" IS NOT NULL AND "order_items"."void_reason_detail" IS NOT NULL AND length(btrim("order_items"."void_reason_detail")) > 0 AND "order_items"."voided_by_user_id" IS NOT NULL)),
	CONSTRAINT "order_items_served_metadata_check" CHECK (("order_items"."served_at" IS NULL AND "order_items"."served_by_user_id" IS NULL) OR ("order_items"."served_at" IS NOT NULL AND "order_items"."served_by_user_id" IS NOT NULL)),
	CONSTRAINT "order_items_served_void_check" CHECK ("order_items"."voided_at" IS NULL OR "order_items"."served_at" IS NULL OR "order_items"."void_reason_type" = 'EMPLOYEE_ERROR')
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"source" varchar(10) NOT NULL,
	"status" varchar(12) DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"client_request_key" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_client_request_key_unique" UNIQUE("client_request_key"),
	CONSTRAINT "orders_customer_name_check" CHECK (length(btrim("orders"."customer_name")) > 0),
	CONSTRAINT "orders_source_check" CHECK ("orders"."source" IN ('QR', 'MANUAL')),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" IN ('PENDING', 'PREPARING', 'SERVED')),
	CONSTRAINT "orders_fingerprint_check" CHECK ("orders"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "orders_creator_check" CHECK (("orders"."source" = 'MANUAL' AND "orders"."created_by_user_id" IS NOT NULL) OR ("orders"."source" = 'QR' AND "orders"."created_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"cashier_user_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"method" varchar(8) DEFAULT 'CASH' NOT NULL,
	"subtotal_idr" bigint NOT NULL,
	"discount_enabled" boolean NOT NULL,
	"configured_discount_idr" bigint NOT NULL,
	"discount_applied_idr" bigint NOT NULL,
	"tax_enabled" boolean NOT NULL,
	"tax_rate_bps" integer NOT NULL,
	"tax_amount_idr" bigint NOT NULL,
	"grand_total_idr" bigint NOT NULL,
	"cash_received_idr" bigint NOT NULL,
	"change_idr" bigint NOT NULL,
	"session_revision" bigint NOT NULL,
	"settings_version" bigint NOT NULL,
	"receipt_snapshot" jsonb NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_method_check" CHECK ("payments"."method" = 'CASH'),
	CONSTRAINT "payments_subtotal_check" CHECK ("payments"."subtotal_idr" >= 0),
	CONSTRAINT "payments_configured_discount_check" CHECK ("payments"."configured_discount_idr" >= 0),
	CONSTRAINT "payments_applied_discount_check" CHECK ("payments"."discount_applied_idr" >= 0 AND "payments"."discount_applied_idr" <= "payments"."subtotal_idr"),
	CONSTRAINT "payments_tax_rate_check" CHECK ("payments"."tax_rate_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "payments_tax_amount_check" CHECK ("payments"."tax_amount_idr" >= 0),
	CONSTRAINT "payments_total_check" CHECK ("payments"."grand_total_idr" >= 0 AND "payments"."grand_total_idr" = "payments"."subtotal_idr" - "payments"."discount_applied_idr" + "payments"."tax_amount_idr"),
	CONSTRAINT "payments_cash_check" CHECK ("payments"."cash_received_idr" >= "payments"."grand_total_idr"),
	CONSTRAINT "payments_change_check" CHECK ("payments"."change_idr" >= 0 AND "payments"."change_idr" = "payments"."cash_received_idr" - "payments"."grand_total_idr")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"customer_contact" varchar(80),
	"guest_count" integer NOT NULL,
	"reserved_for" timestamp with time zone NOT NULL,
	"notes" text,
	"status" varchar(16) DEFAULT 'RESERVED' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_customer_name_check" CHECK (length(btrim("reservations"."customer_name")) > 0),
	CONSTRAINT "reservations_guest_count_check" CHECK ("reservations"."guest_count" > 0),
	CONSTRAINT "reservations_status_check" CHECK ("reservations"."status" IN ('RESERVED', 'CHECKED_IN', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"role" varchar(12) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profiles_role_check" CHECK ("staff_profiles"."role" IN ('ADMIN', 'CASHIER'))
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"store_name" varchar(200) DEFAULT 'Restaurant POS Demo' NOT NULL,
	"discount_enabled" boolean DEFAULT false NOT NULL,
	"discount_amount_idr" bigint DEFAULT 0 NOT NULL,
	"tax_enabled" boolean DEFAULT false NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_settings_singleton_check" CHECK ("store_settings"."id" = 1),
	CONSTRAINT "store_settings_discount_check" CHECK ("store_settings"."discount_amount_idr" >= 0),
	CONSTRAINT "store_settings_tax_rate_check" CHECK ("store_settings"."tax_rate_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "store_settings_version_check" CHECK ("store_settings"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_by_user_id" uuid,
	"bill_revision" bigint DEFAULT 1 NOT NULL,
	"closed_at" timestamp with time zone,
	"closure_reason" varchar(12),
	"closed_by_user_id" uuid,
	CONSTRAINT "table_sessions_revision_check" CHECK ("table_sessions"."bill_revision" >= 1),
	CONSTRAINT "table_sessions_reason_check" CHECK ("table_sessions"."closure_reason" IN ('PAID', 'ALL_VOID')),
	CONSTRAINT "table_sessions_closed_check" CHECK (("table_sessions"."closed_at" IS NULL AND "table_sessions"."closure_reason" IS NULL) OR ("table_sessions"."closed_at" IS NOT NULL AND "table_sessions"."closure_reason" IS NOT NULL)),
	CONSTRAINT "table_sessions_closed_time_check" CHECK ("table_sessions"."closed_at" IS NULL OR "table_sessions"."closed_at" >= "table_sessions"."opened_at")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_served_by_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("served_by_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_voided_by_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_accepted_by_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashier_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("cashier_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_updated_by_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_opened_by_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_closed_by_user_id_staff_profiles_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."staff_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_session_time_idx" ON "audit_events" USING btree ("session_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_entity_time_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_lower_uniq" ON "categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "menu_items_catalog_idx" ON "menu_items" USING btree ("category_id","is_available") WHERE archived_at IS NULL;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_menu_idx" ON "order_items" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "orders_session_created_idx" ON "orders" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at") WHERE voided_at IS NULL;--> statement-breakpoint
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paid_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_one_reserved_per_table" ON "reservations" USING btree ("table_id") WHERE status = 'RESERVED';--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_one_active_per_table" ON "table_sessions" USING btree ("table_id") WHERE closed_at IS NULL;--> statement-breakpoint
CREATE INDEX "table_sessions_table_history_idx" ON "table_sessions" USING btree ("table_id","opened_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_neon_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE RESTRICT;
