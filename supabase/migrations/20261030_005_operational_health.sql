-- Operational activity is private and bounded to one row. No synthetic orders/users.
-- Apply through an authenticated schema-owner migration. The worker uses a server key.
BEGIN;

CREATE SCHEMA IF NOT EXISTS aurora_monitoring;
REVOKE ALL ON SCHEMA aurora_monitoring FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS aurora_monitoring.app_health (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_slot timestamptz,
  checked_at timestamptz,
  request_id uuid,
  check_count bigint NOT NULL DEFAULT 0 CHECK (check_count >= 0)
);
ALTER TABLE aurora_monitoring.app_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE aurora_monitoring.app_health FROM PUBLIC, anon, authenticated;
INSERT INTO aurora_monitoring.app_health (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.aurora_operational_heartbeat(p_slot timestamptz, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_checked_at timestamptz;
  v_applied boolean;
BEGIN
  IF p_slot IS NULL OR p_request_id IS NULL
     OR p_slot <> pg_catalog.date_bin(INTERVAL '6 hours', p_slot, TIMESTAMPTZ '2000-01-01 00:00:00+00')
     OR p_slot > v_now OR p_slot < v_now - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'Invalid operational health slot' USING ERRCODE = '22023';
  END IF;

  UPDATE aurora_monitoring.app_health
     SET last_slot = p_slot, checked_at = v_now, request_id = p_request_id,
         check_count = check_count + 1
   WHERE id = 1 AND (last_slot IS NULL OR last_slot < p_slot)
   RETURNING checked_at INTO v_checked_at;
  v_applied := FOUND;
  IF NOT v_applied THEN
    SELECT h.checked_at INTO v_checked_at FROM aurora_monitoring.app_health AS h WHERE h.id = 1;
  END IF;
  IF v_checked_at IS NULL THEN
    RAISE EXCEPTION 'Operational health storage unavailable' USING ERRCODE = '55000';
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'applied', v_applied, 'checked_at', v_checked_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.aurora_operational_heartbeat(timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aurora_operational_heartbeat(timestamptz, uuid) TO service_role;
COMMENT ON FUNCTION public.aurora_operational_heartbeat(timestamptz, uuid)
IS 'Private bounded operational check. One monotonic update per UTC six-hour slot; duplicate and old slots do not increment.';

COMMIT;
