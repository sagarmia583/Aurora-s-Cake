-- Transitional private persistence for the EXISTING Apps Script business rules.
-- Apply after 006. Nothing switches the live backend. Do NOT apply 001-004.
BEGIN;
CREATE SCHEMA IF NOT EXISTS aurora_runtime;
REVOKE ALL ON SCHEMA aurora_runtime FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS aurora_runtime.state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  project_ref text NOT NULL CHECK(project_ref='dtvefwpaxwffxglqbfoo'),
  import_run_id text NOT NULL REFERENCES aurora_migration.runs(run_id),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  audit_review jsonb NOT NULL DEFAULT '{}'::jsonb,
  promoted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS aurora_runtime.tables (
  table_name text PRIMARY KEY,
  headers jsonb NOT NULL CHECK(jsonb_typeof(headers)='array' AND jsonb_array_length(headers) BETWEEN 1 AND 100)
);
CREATE TABLE IF NOT EXISTS aurora_runtime.rows (
  table_name text NOT NULL REFERENCES aurora_runtime.tables(table_name),
  sheet_row integer NOT NULL CHECK(sheet_row BETWEEN 2 AND 50001),
  cells jsonb NOT NULL CHECK(jsonb_typeof(cells)='array' AND jsonb_array_length(cells)<=100),
  source_formulas jsonb,
  PRIMARY KEY(table_name,sheet_row)
);
CREATE TABLE IF NOT EXISTS aurora_runtime.commits (
  operation_id uuid PRIMARY KEY,
  expected_revision bigint NOT NULL,
  payload_sha256 text NOT NULL,
  committed_revision bigint NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE aurora_runtime.state ENABLE ROW LEVEL SECURITY;
ALTER TABLE aurora_runtime.state FORCE ROW LEVEL SECURITY;
ALTER TABLE aurora_runtime.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE aurora_runtime.tables FORCE ROW LEVEL SECURITY;
ALTER TABLE aurora_runtime.rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE aurora_runtime.rows FORCE ROW LEVEL SECURITY;
ALTER TABLE aurora_runtime.commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE aurora_runtime.commits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA aurora_runtime FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA aurora_runtime REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

-- Owner SQL Editor only. An existing runtime is never overwritten or re-imported.
CREATE OR REPLACE FUNCTION aurora_runtime.promote_staged_run(
  p_run_id text, p_expected_source_sha256 text, p_accept_static_formulas boolean DEFAULT false,
  p_reviewed_audits_sha256 text DEFAULT NULL, p_review_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aurora_runtime AS $$
DECLARE r aurora_migration.runs%ROWTYPE; total_rows bigint; total_tables bigint; audit_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('aurora-runtime-promotion',0));
  SELECT * INTO r FROM aurora_migration.runs WHERE run_id=p_run_id;
  IF NOT FOUND OR r.status<>'verified_staging' OR r.target_project_ref<>'dtvefwpaxwffxglqbfoo'
     OR r.source_sha256 IS DISTINCT FROM p_expected_source_sha256 THEN
    RAISE EXCEPTION 'verified_source_required';
  END IF;
  IF EXISTS(SELECT 1 FROM aurora_runtime.state) THEN
    IF EXISTS(SELECT 1 FROM aurora_runtime.state WHERE import_run_id=p_run_id) THEN
      RETURN jsonb_build_object('ok',true,'already_promoted',true,'revision',(SELECT revision::text FROM aurora_runtime.state));
    END IF;
    RAISE EXCEPTION 'runtime_already_initialized';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.manifest->'audits','[]'::jsonb)) a WHERE a->>'severity'='blocker') THEN
    audit_hash=encode(sha256(convert_to(coalesce(r.manifest->'audits','[]'::jsonb)::text,'UTF8')),'hex');
    IF p_reviewed_audits_sha256 IS DISTINCT FROM audit_hash OR length(trim(coalesce(p_review_note,''))) NOT BETWEEN 20 AND 2000 THEN
      RAISE EXCEPTION 'exact_audit_review_and_note_required';
    END IF;
  END IF;
  SELECT count(*) INTO total_tables FROM aurora_migration.source_tables WHERE run_id=p_run_id;
  SELECT count(*) INTO total_rows FROM aurora_migration.source_rows WHERE run_id=p_run_id;
  IF total_tables NOT BETWEEN 1 AND 64 OR total_rows>50000 THEN RAISE EXCEPTION 'runtime_snapshot_limit'; END IF;
  IF total_tables<>(r.manifest->>'table_count')::bigint OR total_rows<>(r.manifest->>'row_count')::bigint
     OR EXISTS(SELECT 1 FROM aurora_migration.source_tables t WHERE t.run_id=p_run_id AND
       (jsonb_array_length(t.headers) NOT BETWEEN 1 AND 100 OR t.row_count<>(SELECT count(*) FROM aurora_migration.source_rows x WHERE x.run_id=t.run_id AND x.table_name=t.table_name)))
     OR EXISTS(SELECT 1 FROM aurora_migration.source_rows x JOIN aurora_migration.source_tables t USING(run_id,table_name)
       WHERE x.run_id=p_run_id AND (x.sheet_row>50001 OR jsonb_array_length(x.cells)>jsonb_array_length(t.headers))) THEN
    RAISE EXCEPTION 'source_count_or_width_mismatch';
  END IF;
  IF NOT p_accept_static_formulas AND EXISTS(SELECT 1 FROM aurora_migration.source_rows x,
       LATERAL jsonb_array_elements_text(coalesce(x.formulas,'[]'::jsonb)) f(value)
       WHERE x.run_id=p_run_id AND coalesce(f.value,'')<>'') THEN
    RAISE EXCEPTION 'formula_recalculation_requires_explicit_review';
  END IF;
  INSERT INTO aurora_runtime.tables(table_name,headers) SELECT table_name,headers FROM aurora_migration.source_tables WHERE run_id=p_run_id;
  INSERT INTO aurora_runtime.rows(table_name,sheet_row,cells,source_formulas)
    SELECT table_name,sheet_row,cells,formulas FROM aurora_migration.source_rows WHERE run_id=p_run_id;
  INSERT INTO aurora_runtime.state(project_ref,import_run_id,audit_review)
    VALUES('dtvefwpaxwffxglqbfoo',p_run_id,jsonb_build_object('audits_sha256',audit_hash,'note',p_review_note,'accepted_static_formulas',p_accept_static_formulas));
  RETURN jsonb_build_object('ok',true,'revision','1','tables',total_tables,'rows',total_rows,'live_backend_changed',false);
END $$;
REVOKE ALL ON FUNCTION aurora_runtime.promote_staged_run(text,text,boolean,text,text) FROM PUBLIC, anon, authenticated, service_role;

-- A single statement reads one MVCC snapshot: no cross-table revision drift.
CREATE OR REPLACE FUNCTION public.aurora_runtime_snapshot(p_project_ref text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,aurora_runtime AS $$
DECLARE result jsonb;
BEGIN
  IF p_project_ref IS DISTINCT FROM 'dtvefwpaxwffxglqbfoo' THEN RAISE EXCEPTION 'wrong_project'; END IF;
  IF NOT EXISTS(SELECT 1 FROM aurora_runtime.state) THEN RAISE EXCEPTION 'runtime_not_promoted'; END IF;
  IF (SELECT count(*) FROM aurora_runtime.rows)>50000 OR (SELECT count(*) FROM aurora_runtime.tables)>64 THEN RAISE EXCEPTION 'runtime_snapshot_limit'; END IF;
  SELECT jsonb_build_object('project_ref',s.project_ref,'revision',s.revision::text,
    'tables',coalesce((SELECT jsonb_object_agg(t.table_name,jsonb_build_object('headers',t.headers,
      'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('sheet_row',r.sheet_row,'cells',r.cells) ORDER BY r.sheet_row)
                       FROM aurora_runtime.rows r WHERE r.table_name=t.table_name),'[]'::jsonb)))
                     FROM aurora_runtime.tables t),'{}'::jsonb))
    INTO result FROM aurora_runtime.state s;
  IF octet_length(result::text)>8388608 THEN RAISE EXCEPTION 'runtime_snapshot_byte_limit'; END IF;
  RETURN result;
END $$;

-- Atomic bounded ROW DELTA. No table delete, truncate, replacement, schema edit,
-- dynamic SQL or caller-supplied schema/table identifier interpolation.
CREATE OR REPLACE FUNCTION public.aurora_runtime_commit(
  p_project_ref text,p_expected_revision text,p_operation_id uuid,p_changes jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aurora_runtime AS $$
DECLARE current_revision bigint; old_commit aurora_runtime.commits%ROWTYPE;
        payload_hash text; change jsonb; header_width integer; row_no integer;
        table_id text; next_row integer; key_column integer; key_value jsonb;
BEGIN
  IF p_project_ref IS DISTINCT FROM 'dtvefwpaxwffxglqbfoo' THEN RAISE EXCEPTION 'wrong_project'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision!~'^[1-9][0-9]{0,17}$' OR p_operation_id IS NULL
     OR jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) NOT BETWEEN 1 AND 1000
     OR octet_length(p_changes::text)>2097152 THEN RAISE EXCEPTION 'invalid_commit'; END IF;
  payload_hash=encode(sha256(convert_to(p_changes::text,'UTF8')),'hex');
  SELECT revision INTO current_revision FROM aurora_runtime.state FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime_not_promoted'; END IF;
  SELECT * INTO old_commit FROM aurora_runtime.commits WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF old_commit.expected_revision<>p_expected_revision::bigint OR old_commit.payload_sha256<>payload_hash THEN RAISE EXCEPTION 'operation_id_conflict'; END IF;
    RETURN jsonb_build_object('ok',true,'revision',old_commit.committed_revision::text,'replayed',true);
  END IF;
  IF current_revision<>p_expected_revision::bigint THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_changes) c GROUP BY c->>'table',c->>'row' HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate_row_change'; END IF;
  FOR change IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
    IF jsonb_typeof(change) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(change))<>3
       OR NOT(change ?& ARRAY['table','row','cells']) OR jsonb_typeof(change->'table')<>'string'
       OR jsonb_typeof(change->'row')<>'number' OR (change->>'row')!~'^[0-9]{1,5}$'
       OR jsonb_typeof(change->'cells')<>'array' THEN RAISE EXCEPTION 'invalid_row_change'; END IF;
    table_id=change->>'table'; row_no=(change->>'row')::integer;
    SELECT jsonb_array_length(headers) INTO header_width FROM aurora_runtime.tables WHERE table_name=table_id;
    IF NOT FOUND OR row_no NOT BETWEEN 2 AND 50001 OR jsonb_array_length(change->'cells')<>header_width
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(change->'cells') v WHERE jsonb_typeof(v) NOT IN('string','number','boolean','null')) THEN RAISE EXCEPTION 'invalid_row_cells'; END IF;
    IF NOT EXISTS(SELECT 1 FROM aurora_runtime.rows WHERE table_name=table_id AND sheet_row=row_no) THEN
      SELECT coalesce(max(sheet_row),1)+1 INTO next_row FROM aurora_runtime.rows WHERE table_name=table_id;
      IF row_no<>next_row THEN RAISE EXCEPTION 'append_must_be_contiguous'; END IF;
    END IF;
    -- IDs/keys of existing records cannot be replaced, even by the backend API.
    SELECT ordinality::integer-1 INTO key_column FROM aurora_runtime.tables t,
      LATERAL jsonb_array_elements_text(t.headers) WITH ORDINALITY h(value,ordinality)
      WHERE t.table_name=table_id AND lower(trim(h.value)) IN('id','token_hash','session_id','challenge_id','key')
      ORDER BY CASE lower(trim(h.value)) WHEN 'id' THEN 0 WHEN 'token_hash' THEN 1 WHEN 'session_id' THEN 2 WHEN 'challenge_id' THEN 3 ELSE 4 END LIMIT 1;
    IF key_column IS NOT NULL THEN
      key_value=(change->'cells')->key_column;
      IF EXISTS(SELECT 1 FROM aurora_runtime.rows r WHERE r.table_name=table_id AND r.sheet_row=row_no
         AND r.cells->key_column IS DISTINCT FROM key_value) THEN RAISE EXCEPTION 'record_key_immutable'; END IF;
      IF key_value IS NOT NULL AND key_value NOT IN('null'::jsonb,'""'::jsonb)
         AND EXISTS(SELECT 1 FROM aurora_runtime.rows r WHERE r.table_name=table_id AND r.sheet_row<>row_no AND r.cells->key_column=key_value) THEN RAISE EXCEPTION 'duplicate_record_key'; END IF;
    END IF;
    INSERT INTO aurora_runtime.rows(table_name,sheet_row,cells) VALUES(table_id,row_no,change->'cells')
      ON CONFLICT(table_name,sheet_row) DO UPDATE SET cells=EXCLUDED.cells;
  END LOOP;
  IF (SELECT count(*) FROM aurora_runtime.rows)>50000 THEN RAISE EXCEPTION 'runtime_snapshot_limit'; END IF;
  UPDATE aurora_runtime.state SET revision=revision+1 RETURNING revision INTO current_revision;
  INSERT INTO aurora_runtime.commits(operation_id,expected_revision,payload_sha256,committed_revision)
    VALUES(p_operation_id,p_expected_revision::bigint,payload_hash,current_revision);
  RETURN jsonb_build_object('ok',true,'revision',current_revision::text,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.aurora_runtime_snapshot(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aurora_runtime_commit(text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aurora_runtime_snapshot(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.aurora_runtime_commit(text,text,uuid,jsonb) TO service_role;
COMMENT ON FUNCTION public.aurora_runtime_snapshot(text) IS 'Private backend only. Contains credentials hashes and customer data. Never expose to browser.';
COMMIT;
