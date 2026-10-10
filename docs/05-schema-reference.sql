-- Restaurant POS — 05 / PostgreSQL reference DDL (review draft)
-- Neon PostgreSQL. Run ONLY against a disposable development database after review.
-- The authentication "user" / sessions / account / verification tables belong to
-- Better Auth migrations and are intentionally not reproduced here.
-- staff_profiles.user_id should receive FK -> actual Better Auth user table during integration.

CREATE TABLE staff_profiles (
  user_id text PRIMARY KEY,
  display_name varchar(120) NOT NULL,
  role varchar(12) NOT NULL CHECK (role IN ('ADMIN', 'CASHIER')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dining_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number varchar(30) NOT NULL UNIQUE,
  qr_token varchar(128) NOT NULL UNIQUE,
  status varchar(12) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED')),
  cycle_number integer NOT NULL DEFAULT 0 CHECK (cycle_number >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_lower_uniq ON categories (lower(name));

CREATE TABLE menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name varchar(160) NOT NULL,
  description text,
  image_url text,
  price_idr bigint NOT NULL CHECK (price_idr >= 0),
  is_available boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX menu_items_catalog_idx ON menu_items(category_id, is_available)
  WHERE archived_at IS NULL;

CREATE TABLE store_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name varchar(200) NOT NULL DEFAULT 'Restaurant POS Demo',
  discount_enabled boolean NOT NULL DEFAULT false,
  discount_amount_idr bigint NOT NULL DEFAULT 0 CHECK (discount_amount_idr >= 0),
  tax_enabled boolean NOT NULL DEFAULT false,
  tax_rate_bps integer NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by_user_id text REFERENCES staff_profiles(user_id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO store_settings(id) VALUES (1);

CREATE TABLE table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by_user_id text REFERENCES staff_profiles(user_id) ON DELETE SET NULL,
  bill_revision bigint NOT NULL DEFAULT 1 CHECK (bill_revision >= 1),
  closed_at timestamptz,
  closure_reason varchar(12) CHECK (closure_reason IN ('PAID', 'ALL_VOID')),
  closed_by_user_id text REFERENCES staff_profiles(user_id) ON DELETE SET NULL,
  CHECK (
    (closed_at IS NULL AND closure_reason IS NULL) OR
    (closed_at IS NOT NULL AND closure_reason IS NOT NULL)
  ),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
-- Hard invariant: at most one active session for a table.
CREATE UNIQUE INDEX table_sessions_one_active_per_table
  ON table_sessions(table_id) WHERE closed_at IS NULL;
CREATE INDEX table_sessions_table_history_idx ON table_sessions(table_id, opened_at DESC);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
  customer_name varchar(120) NOT NULL CHECK (length(btrim(customer_name)) > 0),
  customer_contact varchar(80),
  guest_count integer NOT NULL CHECK (guest_count > 0),
  reserved_for timestamptz NOT NULL,
  notes text,
  status varchar(16) NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED', 'CHECKED_IN', 'CANCELLED')),
  created_by_user_id text NOT NULL REFERENCES staff_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reservations_one_reserved_per_table
  ON reservations(table_id) WHERE status = 'RESERVED';

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES table_sessions(id) ON DELETE RESTRICT,
  customer_name varchar(120) NOT NULL CHECK (length(btrim(customer_name)) > 0),
  source varchar(10) NOT NULL CHECK (source IN ('QR', 'MANUAL')),
  status varchar(12) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PREPARING', 'SERVED')),
  note text,
  client_request_key uuid NOT NULL UNIQUE,
  created_by_user_id text REFERENCES staff_profiles(user_id) ON DELETE SET NULL,
  accepted_at timestamptz,
  accepted_by_user_id text REFERENCES staff_profiles(user_id) ON DELETE SET NULL,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source = 'MANUAL' AND created_by_user_id IS NOT NULL) OR
         (source = 'QR' AND created_by_user_id IS NULL))
);
CREATE INDEX orders_session_created_idx ON orders(session_id, created_at);
CREATE INDEX orders_status_created_idx ON orders(status, created_at)
  WHERE voided_at IS NULL;

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_name_snapshot varchar(160) NOT NULL,
  unit_price_idr bigint NOT NULL CHECK (unit_price_idr >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total_idr bigint GENERATED ALWAYS AS (unit_price_idr * quantity) STORED,
  customer_note text,
  served_at timestamptz,
  served_by_user_id text REFERENCES staff_profiles(user_id) ON DELETE SET NULL,
  voided_at timestamptz,
  voided_by_user_id text REFERENCES staff_profiles(user_id) ON DELETE SET NULL,
  void_reason_type varchar(20) CHECK (void_reason_type IN ('CUSTOMER_REQUEST','EMPLOYEE_ERROR')),
  void_reason_detail text,
  CHECK (
    (voided_at IS NULL AND void_reason_type IS NULL AND void_reason_detail IS NULL AND voided_by_user_id IS NULL)
    OR
    (voided_at IS NOT NULL AND void_reason_type IS NOT NULL AND
      void_reason_detail IS NOT NULL AND length(btrim(void_reason_detail)) > 0 AND
      voided_by_user_id IS NOT NULL)
  ),
  CHECK ((served_at IS NULL AND served_by_user_id IS NULL) OR
         (served_at IS NOT NULL AND served_by_user_id IS NOT NULL)),
  CHECK (voided_at IS NULL OR served_at IS NULL OR void_reason_type = 'EMPLOYEE_ERROR')
);
CREATE INDEX order_items_order_idx ON order_items(order_id);
CREATE INDEX order_items_menu_idx ON order_items(menu_item_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES table_sessions(id) ON DELETE RESTRICT,
  cashier_user_id text NOT NULL REFERENCES staff_profiles(user_id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL UNIQUE,
  method varchar(8) NOT NULL DEFAULT 'CASH' CHECK (method = 'CASH'),
  subtotal_idr bigint NOT NULL CHECK (subtotal_idr >= 0),
  discount_enabled boolean NOT NULL,
  configured_discount_idr bigint NOT NULL CHECK (configured_discount_idr >= 0),
  discount_applied_idr bigint NOT NULL CHECK (discount_applied_idr >= 0),
  tax_enabled boolean NOT NULL,
  tax_rate_bps integer NOT NULL CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  tax_amount_idr bigint NOT NULL CHECK (tax_amount_idr >= 0),
  grand_total_idr bigint NOT NULL CHECK (grand_total_idr >= 0),
  cash_received_idr bigint NOT NULL,
  change_idr bigint NOT NULL CHECK (change_idr >= 0),
  session_revision bigint NOT NULL,
  settings_version bigint NOT NULL,
  receipt_snapshot jsonb NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cash_received_idr >= grand_total_idr),
  CHECK (change_idr = cash_received_idr - grand_total_idr),
  CHECK (discount_applied_idr <= subtotal_idr),
  CHECK (grand_total_idr = subtotal_idr - discount_applied_idr + tax_amount_idr)
);
CREATE INDEX payments_paid_at_idx ON payments(paid_at DESC);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id text REFERENCES staff_profiles(user_id) ON DELETE SET NULL,
  actor_type varchar(10) NOT NULL CHECK (actor_type IN ('CUSTOMER','STAFF','SYSTEM')),
  action varchar(80) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id uuid,
  table_id uuid REFERENCES dining_tables(id) ON DELETE SET NULL,
  session_id uuid REFERENCES table_sessions(id) ON DELETE SET NULL,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actor_type <> 'STAFF' OR actor_user_id IS NOT NULL)
);
CREATE INDEX audit_session_time_idx ON audit_events(session_id, created_at DESC);
CREATE INDEX audit_entity_time_idx ON audit_events(entity_type, entity_id, created_at DESC);

-- Cross-table/domain invariants intentionally enforced by transactional services:
-- 1. status OCCUPIED iff table has active session; RESERVED iff active reservation.
-- 2. checkout, served/void and close operations lock table/session rows consistently.
-- 3. paid session must have corresponding payment; all-void session must not.
-- 4. payment succeeds only if non-void item count > 0 AND all active orders served.
-- 5. bill includes only non-void lines and current settings; paid receipts never recompute.
-- 6. active session checkout requires matching table cycle number; closing increments it.
-- 7. Better Auth user FK is installed in a separate authentication-integrated migration.
