-- R10 private Google Sheets mirror for Aurora's Cake.
-- Run in the correct Supabase project AFTER backing up the database.
-- Sheets is the operational source of truth during migration.
-- Use opaque legacy text IDs: Sheet IDs are not always UUIDs.
create table if not exists public.aurora_mirror_records (
  source_table text not null check (source_table in (
    'orders','order_items','pos_sales','custom_cake_requests',
    'inventory_items','inventory_movements','cake_cost_items','order_cost_snapshots',
    'refund_returns','rider_cash_deposits','customer_master',
    'products','product_variants','categories','settings')),
  source_id text not null check (length(source_id) between 1 and 180),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  mirrored_at timestamptz not null default now(),
  primary key (source_table, source_id)
);
create index if not exists aurora_mirror_records_updated_idx
  on public.aurora_mirror_records(mirrored_at desc);
alter table public.aurora_mirror_records enable row level security;
revoke all on public.aurora_mirror_records from anon, authenticated, public;
-- No client-side SELECT/INSERT policies. Only the trusted server-side
-- service role may write to this mirror. NEVER ship a service role key to Expo.
comment on table public.aurora_mirror_records is
 'Private one-way eventual-consistency replica from Aurora Google Sheets. Not the system of record.';

create table if not exists public.aurora_mirror_sync_runs (
 run_id uuid primary key default gen_random_uuid(),
 received_at timestamptz not null default now(),
 items_count integer not null check (items_count between 1 and 50),
 source text not null default 'google_apps_script',
 status text not null check (status in ('completed','failed'))
);
alter table public.aurora_mirror_sync_runs enable row level security;
revoke all on public.aurora_mirror_sync_runs from anon, authenticated, public;
