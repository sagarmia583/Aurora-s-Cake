-- Aurora's Cake: Cloudflare D1 / SQLite foundational schema, v1.
-- Run against a NEW D1 database, not existing Supabase/Firebase/Sheets.
-- Prices and accounting amounts are INTEGER Bangladeshi poisha (100 = ৳1).
-- This migration does not insert mock products or change the live checkout.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_meta(key,value) VALUES ('schema_version','1');

CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT PRIMARY KEY,
  access_email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('super_admin','admin','manager','order_manager','baker','delivery','accountant')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff_members(active,role);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, category_id TEXT REFERENCES categories(id),
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  image_key TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_live ON products(active,sort_order);
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  label TEXT NOT NULL, price_paisa INTEGER NOT NULL CHECK(price_paisa>=0),
  cost_snapshot_paisa INTEGER CHECK(cost_snapshot_paisa>=0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(product_id,label)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id,active);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL,
  on_hand_milli INTEGER NOT NULL DEFAULT 0 CHECK(on_hand_milli>=0),
  reorder_at_milli INTEGER NOT NULL DEFAULT 0 CHECK(reorder_at_milli>=0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS recipes (
  product_variant_id TEXT NOT NULL REFERENCES product_variants(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),
  PRIMARY KEY(product_variant_id,inventory_item_id)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES inventory_items(id),
  delta_milli INTEGER NOT NULL CHECK(delta_milli!=0),
  balance_after_milli INTEGER NOT NULL CHECK(balance_after_milli>=0),
  reason TEXT NOT NULL CHECK(reason IN ('purchase','production','sale','waste','return','correction')),
  related_id TEXT NOT NULL DEFAULT '', unit_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost_paisa>=0),
  created_by TEXT NOT NULL REFERENCES staff_members(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inv_item ON inventory_movements(item_id,created_at);
CREATE TRIGGER IF NOT EXISTS inv_ledger_no_update BEFORE UPDATE ON inventory_movements
BEGIN SELECT RAISE(ABORT,'inventory_ledger_immutable'); END;
CREATE TRIGGER IF NOT EXISTS inv_ledger_no_delete BEFORE DELETE ON inventory_movements
BEGIN SELECT RAISE(ABORT,'inventory_ledger_immutable'); END;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, phone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_phone ON customers(phone);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, source TEXT NOT NULL CHECK(source IN ('shop','pos','legacy_import')),
  source_record_id TEXT, idempotency_key TEXT UNIQUE,
  order_number TEXT UNIQUE NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL,
  delivery_address TEXT NOT NULL DEFAULT '',
  delivery_date TEXT, delivery_slot TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN
    ('pending','confirmed','preparing','ready','assigned','picked_up','out_for_delivery','delivered','cancelled','returned')),
  payment_method TEXT NOT NULL DEFAULT 'cod' CHECK(payment_method IN ('cod','cash','bank','bkash','nagad')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','part_paid','paid','refunded')),
  subtotal_paisa INTEGER NOT NULL CHECK(subtotal_paisa>=0),
  discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(discount_paisa>=0),
  delivery_fee_paisa INTEGER NOT NULL DEFAULT 0 CHECK(delivery_fee_paisa>=0),
  total_paisa INTEGER NOT NULL CHECK(total_paisa>=0),
  note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source,source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_order_recent ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status ON orders(status,created_at DESC);
CREATE TABLE IF NOT EXISTS order_lines (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_variant_id TEXT REFERENCES product_variants(id),
  product_name_snapshot TEXT NOT NULL, variant_snapshot TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty>0 AND qty<=1000),
  unit_price_paisa INTEGER NOT NULL CHECK(unit_price_paisa>=0),
  line_total_paisa INTEGER NOT NULL CHECK(line_total_paisa>=0),
  recipe_cost_snapshot_paisa INTEGER NOT NULL DEFAULT 0 CHECK(recipe_cost_snapshot_paisa>=0)
);
CREATE INDEX IF NOT EXISTS idx_order_lines ON order_lines(order_id);
CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
  old_status TEXT NOT NULL, new_status TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES staff_members(id),
  reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS order_events_no_update BEFORE UPDATE ON order_events
BEGIN SELECT RAISE(ABORT,'order_events_immutable'); END;
CREATE TRIGGER IF NOT EXISTS order_events_no_delete BEFORE DELETE ON order_events
BEGIN SELECT RAISE(ABORT,'order_events_immutable'); END;

CREATE TABLE IF NOT EXISTS production_batches (
  id TEXT PRIMARY KEY, order_id TEXT REFERENCES orders(id),
  product_variant_id TEXT REFERENCES product_variants(id),
  qty INTEGER NOT NULL CHECK(qty>0), status TEXT NOT NULL DEFAULT 'planned',
  material_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK(material_cost_paisa>=0),
  labor_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK(labor_cost_paisa>=0),
  overhead_paisa INTEGER NOT NULL DEFAULT 0 CHECK(overhead_paisa>=0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cash_registers (
  id TEXT PRIMARY KEY, opened_by TEXT NOT NULL REFERENCES staff_members(id),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  opening_paisa INTEGER NOT NULL DEFAULT 0 CHECK(opening_paisa>=0),
  closed_at TEXT, closed_by TEXT REFERENCES staff_members(id),
  counted_paisa INTEGER CHECK(counted_paisa>=0)
);
CREATE TABLE IF NOT EXISTS pos_sales (
  id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
  register_id TEXT NOT NULL REFERENCES cash_registers(id),
  cashier_id TEXT NOT NULL REFERENCES staff_members(id),
  order_id TEXT UNIQUE REFERENCES orders(id), total_paisa INTEGER NOT NULL CHECK(total_paisa>=0),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','bank','bkash','nagad')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pos_lines (
  id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES pos_sales(id),
  product_variant_id TEXT REFERENCES product_variants(id),
  product_snapshot TEXT NOT NULL, variant_snapshot TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty>0),
  unit_price_paisa INTEGER NOT NULL CHECK(unit_price_paisa>=0),
  total_paisa INTEGER NOT NULL CHECK(total_paisa>=0),
  cost_snapshot_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cost_snapshot_paisa>=0)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('asset','liability','equity','revenue','expense')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
INSERT OR IGNORE INTO accounts(id,name,kind) VALUES
 ('cash','Cash on hand','asset'),('bank','Bank balance','asset'),
 ('cod_receivable','COD receivable','asset'),('sales','Sales revenue','revenue'),
 ('cogs','Cost of goods sold','expense'),('inventory','Inventory assets','asset'),
 ('misc_expense','General expenses','expense'),('opening_equity','Opening balance','equity');
CREATE TABLE IF NOT EXISTS accounting_journals (
  id TEXT PRIMARY KEY, ref_type TEXT NOT NULL, ref_id TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '', created_by TEXT REFERENCES staff_members(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(ref_type,ref_id)
);
CREATE TABLE IF NOT EXISTS accounting_entries (
  id TEXT PRIMARY KEY, journal_id TEXT NOT NULL REFERENCES accounting_journals(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  debit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(debit_paisa>=0),
  credit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(credit_paisa>=0),
  CHECK((debit_paisa>0 AND credit_paisa=0) OR (credit_paisa>0 AND debit_paisa=0))
);
CREATE INDEX IF NOT EXISTS idx_account_entries ON accounting_entries(journal_id);
CREATE TRIGGER IF NOT EXISTS journal_no_update BEFORE UPDATE ON accounting_journals
BEGIN SELECT RAISE(ABORT,'journal_immutable'); END;
CREATE TRIGGER IF NOT EXISTS journal_no_delete BEFORE DELETE ON accounting_journals
BEGIN SELECT RAISE(ABORT,'journal_immutable'); END;
CREATE TRIGGER IF NOT EXISTS entries_no_update BEFORE UPDATE ON accounting_entries
BEGIN SELECT RAISE(ABORT,'accounting_entries_immutable'); END;
CREATE TRIGGER IF NOT EXISTS entries_no_delete BEFORE DELETE ON accounting_entries
BEGIN SELECT RAISE(ABORT,'accounting_entries_immutable'); END;
CREATE VIEW IF NOT EXISTS journal_balance AS
 SELECT journal_id,SUM(debit_paisa) AS debits,SUM(credit_paisa) AS credits
 FROM accounting_entries GROUP BY journal_id;

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY, order_id TEXT REFERENCES orders(id),
  pos_sale_id TEXT REFERENCES pos_sales(id), type TEXT NOT NULL CHECK(type IN ('paid','refund','void')),
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  method TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL REFERENCES staff_members(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  reason TEXT NOT NULL, approved_by TEXT NOT NULL REFERENCES staff_members(id),
  status TEXT NOT NULL CHECK(status IN ('approved','processed','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_objects (
  id TEXT PRIMARY KEY, r2_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('product','banner','receipt','delivery_proof')),
  mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
  public INTEGER NOT NULL DEFAULT 0 CHECK(public IN (0,1)),
  uploaded_by TEXT REFERENCES staff_members(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_public ON media_objects(public,kind);

-- Original source rows are kept without a lossy UUID conversion.
-- Import staging is PRIVATE and never exposed by Worker public routes.
CREATE TABLE IF NOT EXISTS migration_runs (
  id TEXT PRIMARY KEY, source TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL, expected_rows INTEGER NOT NULL CHECK(expected_rows>=0),
  expected_order_paisa INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'staged' CHECK(state IN ('staged','verified','applied','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS migration_staging (
  run_id TEXT NOT NULL REFERENCES migration_runs(id),
  source_table TEXT NOT NULL,
  legacy_id TEXT NOT NULL, content_sha256 TEXT NOT NULL,
  source_json TEXT NOT NULL,
  PRIMARY KEY(run_id,source_table,legacy_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, actor_id TEXT REFERENCES staff_members(id),
  action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
