-- Read-only lineage for the private owner-controlled freeze-end check.
-- Requires 006 + 007. No promotion, backend selection or business-data write.
BEGIN;
CREATE OR REPLACE FUNCTION public.aurora_runtime_cutover_status(p_project_ref text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_project_ref IS DISTINCT FROM 'dtvefwpaxwffxglqbfoo' THEN
    RAISE EXCEPTION 'wrong_project';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM aurora_runtime.state) THEN
    RETURN pg_catalog.jsonb_build_object('project_ref','dtvefwpaxwffxglqbfoo','promoted',false);
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'project_ref',s.project_ref,
    'promoted',true,
    'run_id',r.run_id,
    'source_sha256',r.source_sha256,
    'source_exported_at',pg_catalog.to_char(r.source_exported_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'revision',s.revision::text
  ) INTO result
  FROM aurora_runtime.state s
  JOIN aurora_migration.runs r ON r.run_id=s.import_run_id
  WHERE s.singleton AND s.project_ref='dtvefwpaxwffxglqbfoo'
    AND r.target_project_ref='dtvefwpaxwffxglqbfoo' AND r.status='verified_staging';
  IF result IS NULL THEN RAISE EXCEPTION 'runtime_lineage_invalid'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.aurora_runtime_cutover_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aurora_runtime_cutover_status(text) TO service_role;
COMMENT ON FUNCTION public.aurora_runtime_cutover_status(text)
  IS 'Private backend metadata only: promoted source lineage and revision. No customer, credential, receipt or campaign rows.';
COMMIT;
