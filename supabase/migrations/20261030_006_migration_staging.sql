-- Isolated, lossless source backup/staging. This is NOT the production schema.
-- Apply this file alone; migrations 001-004 are an incompatible legacy prototype.
BEGIN;
CREATE SCHEMA IF NOT EXISTS aurora_migration;
REVOKE ALL ON SCHEMA aurora_migration FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS aurora_migration.runs (
  run_id text PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  target_project_ref text NOT NULL CHECK (target_project_ref = 'dtvefwpaxwffxglqbfoo'),
  source_spreadsheet_id text NOT NULL,
  source_exported_at timestamptz NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'verified_staging')),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS aurora_migration.source_tables (
  run_id text NOT NULL REFERENCES aurora_migration.runs(run_id),
  table_name text NOT NULL,
  headers jsonb NOT NULL CHECK (jsonb_typeof(headers) = 'array'),
  column_types jsonb CHECK (column_types IS NULL OR jsonb_typeof(column_types) = 'array'),
  row_count integer NOT NULL CHECK (row_count >= 0),
  table_sha256 text NOT NULL CHECK (table_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (run_id, table_name)
);

CREATE TABLE IF NOT EXISTS aurora_migration.source_rows (
  run_id text NOT NULL,
  table_name text NOT NULL,
  sheet_row integer NOT NULL CHECK (sheet_row >= 2),
  source_id text,
  cells jsonb NOT NULL CHECK (jsonb_typeof(cells) = 'array'),
  formulas jsonb CHECK (formulas IS NULL OR jsonb_typeof(formulas) = 'array'),
  row_sha256 text NOT NULL CHECK (row_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (run_id, table_name, sheet_row),
  FOREIGN KEY (run_id, table_name)
    REFERENCES aurora_migration.source_tables(run_id, table_name)
);
CREATE INDEX IF NOT EXISTS source_rows_source_id_idx
  ON aurora_migration.source_rows(run_id, table_name, source_id);

ALTER TABLE aurora_migration.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE aurora_migration.runs FORCE ROW LEVEL SECURITY;
ALTER TABLE aurora_migration.source_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE aurora_migration.source_tables FORCE ROW LEVEL SECURITY;
ALTER TABLE aurora_migration.source_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE aurora_migration.source_rows FORCE ROW LEVEL SECURITY;
-- Deliberately no browser policies, grants, functions, public views or REST exposure.
REVOKE ALL ON ALL TABLES IN SCHEMA aurora_migration FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA aurora_migration
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
COMMIT;
