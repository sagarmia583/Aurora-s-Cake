#!/usr/bin/env python3
"""Validate Aurora's Cake D1 SQLite migration with the stdlib SQLite engine."""
from pathlib import Path
import sqlite3

sql = Path("cloudflare/d1/migrations/0001_aurora_core.sql").read_text(encoding="utf-8")
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(sql)
tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
required = {
    'staff_members', 'categories', 'products', 'product_variants',
    'orders', 'order_lines', 'customers', 'inventory_items', 'inventory_movements',
    'production_batches', 'recipes', 'pos_sales', 'pos_lines', 'cash_registers',
    'accounting_journals', 'accounting_entries', 'payment_events','refunds',
    'media_objects', 'migration_runs', 'migration_staging','audit_events'
}
assert required <= tables, f"Missing D1 tables: {required-tables}"

db.execute("INSERT INTO staff_members(id,access_email,display_name,role) VALUES (?,?,?,?)",
           ("owner-1","owner@example.com","Owner","super_admin"))
db.execute("INSERT INTO categories(id,name,slug) VALUES (?,?,?)", ("cakes","Cakes","cakes"))
db.execute("INSERT INTO products(id,category_id,name) VALUES (?,?,?)",
           ("cake-1","cakes","Vanilla cake"))
db.execute("INSERT INTO product_variants(id,product_id,label,price_paisa) VALUES (?,?,?,?)",
           ("half","cake-1","Half pound",35000))
db.execute("INSERT INTO inventory_items(id,name,unit,on_hand_milli) VALUES (?,?,?,?)",
           ("flour","Flour","g",1000))
db.execute("""INSERT INTO inventory_movements
 (id,item_id,delta_milli,balance_after_milli,reason,created_by)
 VALUES (?,?,?,?,?,?)""", ("move1","flour",1000,1000,"purchase","owner-1"))
db.execute("""INSERT INTO orders
 (id,source,order_number,customer_name,customer_phone,subtotal_paisa,total_paisa)
 VALUES (?,?,?,?,?,?,?)""",
 ("ord-1","shop","AC-1","Test","01700000000",35000,35000))
db.execute("""INSERT INTO order_lines
 (id,order_id,product_variant_id,product_name_snapshot,variant_snapshot,qty,unit_price_paisa,line_total_paisa)
 VALUES (?,?,?,?,?,?,?,?)""",
 ("line1","ord-1","half","Vanilla cake","Half pound",1,35000,35000))
db.execute("""INSERT INTO accounting_journals(id,ref_type,ref_id,created_by)
 VALUES (?,?,?,?)""",("j1","pos_sale","pos1","owner-1"))
db.execute("""INSERT INTO accounting_entries(id,journal_id,account_id,debit_paisa,credit_paisa)
 VALUES (?,?,?,?,?)""",("a1","j1","cash",35000,0))
db.execute("""INSERT INTO accounting_entries(id,journal_id,account_id,debit_paisa,credit_paisa)
 VALUES (?,?,?,?,?)""",("a2","j1","sales",0,35000))
assert db.execute("SELECT debits,credits FROM journal_balance WHERE journal_id='j1'").fetchone() == (35000,35000)
def rejected(sql,*params):
    try:
        db.execute(sql,params)
    except sqlite3.IntegrityError:
        return
    raise AssertionError("An invalid D1 statement was accepted: "+sql)
rejected("UPDATE inventory_items SET on_hand_milli=-1 WHERE id=?", "flour")
rejected("UPDATE inventory_movements SET delta_milli=? WHERE id=?",2000,"move1")
rejected("DELETE FROM accounting_entries WHERE id=?","a1")
rejected("DELETE FROM accounting_journals WHERE id=?","j1")
rejected("UPDATE order_lines SET order_id=? WHERE id=?","missing","line1")
rejected("INSERT INTO pos_sales(id,idempotency_key,register_id,cashier_id,total_paisa,payment_method) VALUES (?,?,?,?,?,?)",
         "sale1","key1","unknown","owner-1",35000,"cash")
db.execute("""INSERT INTO migration_runs(id,source,manifest_sha256,expected_rows)
 VALUES (?,?,?,?)""",("stage1","old","abc",1))
db.execute("""INSERT INTO migration_staging(run_id,source_table,legacy_id,content_sha256,source_json)
 VALUES (?,?,?,?,?)""",("stage1","orders","legacy1","abc",'{"id":"legacy1"}'))
assert db.execute("SELECT COUNT(*) FROM migration_staging").fetchone()[0] == 1
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
print(f"D1 schema validated: {len(required)} required tables, ledgers immutable, FK and money checks active")
