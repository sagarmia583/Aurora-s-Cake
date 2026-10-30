-- Owner-only Dashboard SQL verification, AFTER applying migration 005.
-- Run this entire file as one script. It never reads or changes business tables.
-- A temporary singleton fixture is changed inside a transaction and ALWAYS rolled back.
-- Keep the final ROLLBACK. If the editor stops on an error, run ROLLBACK; before retrying.
BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '3s';

DO $verify$
DECLARE
  v_original_role name := current_user;
  v_role name;
  v_denied boolean;
  v_result jsonb;
  v_slot timestamptz := pg_catalog.date_bin(INTERVAL '6 hours', pg_catalog.clock_timestamp(), TIMESTAMPTZ '2000-01-01 00:00:00+00');
  v_request uuid := '00000000-0000-4000-8000-000000000001';
  v_counter bigint;
BEGIN
  IF pg_catalog.to_regprocedure('public.aurora_operational_heartbeat(timestamp with time zone,uuid)') IS NULL
     OR pg_catalog.to_regclass('aurora_monitoring.app_health') IS NULL THEN
    RAISE EXCEPTION 'Apply operational health migration 005 first';
  END IF;

  -- Check effective privileges, including grants inherited through PUBLIC/other roles.
  FOREACH v_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name] LOOP
    IF pg_catalog.has_function_privilege(v_role, 'public.aurora_operational_heartbeat(timestamptz,uuid)', 'EXECUTE')
       OR pg_catalog.has_schema_privilege(v_role, 'aurora_monitoring', 'USAGE')
       OR pg_catalog.has_table_privilege(v_role, 'aurora_monitoring.app_health', 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Public role has operational health access: %', v_role;
    END IF;

    -- Exercise the database authorization checks under the real browser roles.
    EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_role);
    v_denied := false;
    BEGIN
      PERFORM public.aurora_operational_heartbeat(v_slot, v_request);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_original_role);
    IF NOT v_denied THEN
      RAISE EXCEPTION 'RPC execution was not denied to %', v_role;
    END IF;

    EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_role);
    v_denied := false;
    BEGIN
      PERFORM h.check_count FROM aurora_monitoring.app_health AS h WHERE h.id = 1;
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_original_role);
    IF NOT v_denied THEN
      RAISE EXCEPTION 'Private health table access was not denied to %', v_role;
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_function_privilege('service_role', 'public.aurora_operational_heartbeat(timestamptz,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role is missing RPC execution permission';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'aurora_monitoring' AND c.relname = 'app_health' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Private health table must have RLS enabled';
  END IF;

  -- This row lock and temporary fixture are reverted by the final ROLLBACK.
  -- It also makes this verification independent of whether today's slot ran already.
  PERFORM h.id FROM aurora_monitoring.app_health AS h WHERE h.id = 1 FOR UPDATE;
  UPDATE aurora_monitoring.app_health
     SET last_slot = NULL, checked_at = NULL, request_id = NULL, check_count = 0
   WHERE id = 1;

  -- Owner smoke call must write exactly once.
  v_result := public.aurora_operational_heartbeat(v_slot, v_request);
  IF v_result->>'ok' IS DISTINCT FROM 'true' OR v_result->>'applied' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Owner smoke call did not apply the health slot';
  END IF;

  -- A second nonce in the same slot cannot increment or replace the first nonce.
  v_result := public.aurora_operational_heartbeat(v_slot, '00000000-0000-4000-8000-000000000002');
  IF v_result->>'applied' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Duplicate health slot was not idempotent';
  END IF;
  v_result := public.aurora_operational_heartbeat(v_slot - INTERVAL '6 hours', v_request);
  IF v_result->>'applied' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Older health slot overwrote the newer slot';
  END IF;

  -- The worker's service role can invoke the RPC but this duplicate does not write.
  EXECUTE 'SET LOCAL ROLE service_role';
  v_result := public.aurora_operational_heartbeat(v_slot, v_request);
  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_original_role);
  IF v_result->>'ok' IS DISTINCT FROM 'true' OR v_result->>'applied' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'service_role RPC verification failed';
  END IF;

  SELECT h.check_count INTO v_counter FROM aurora_monitoring.app_health AS h
   WHERE h.id = 1 AND h.last_slot = v_slot AND h.request_id = v_request;
  IF v_counter IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Health count, nonce, or monotonic slot assertion failed';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM public.aurora_operational_heartbeat(v_slot + INTERVAL '12 hours', v_request);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Future health slot was not rejected';
  END IF;
  RAISE NOTICE 'PASS: browser-role denial, owner/service-role access, idempotency, stale/future protection. All fixture changes will roll back.';
END;
$verify$;

ROLLBACK;
