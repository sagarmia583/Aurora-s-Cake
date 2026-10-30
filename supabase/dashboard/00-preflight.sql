-- READ ONLY. Run first in the Supabase Dashboard SQL Editor.
-- The Dashboard URL MUST be:
-- https://supabase.com/dashboard/project/dtvefwpaxwffxglqbfoo/sql
-- SQL cannot independently infer the Supabase project ref from current_database().
-- Operator: select the exact project above before running any subsequent file.
SELECT 'dtvefwpaxwffxglqbfoo' AS intended_project_ref,
       'Confirm the Dashboard URL project ref manually before continuing' AS required_operator_check,
       current_database() AS database_name,
       current_user AS database_role;

-- Forced RLS is intentional. Apply private administrator functions as the
-- intended trusted database owner (normally postgres), with BYPASSRLS/superuser.
SELECT rolname AS database_role,rolsuper AS is_superuser,rolbypassrls AS bypasses_rls
FROM pg_catalog.pg_roles WHERE rolname=current_user;

-- Inventory existing user schemas/tables before adding anything; no row contents.
SELECT n.nspname AS schema_name, c.relname AS object_name,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned_table'
         WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END AS object_type,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p','v','m')
  AND n.nspname NOT IN ('information_schema','pg_catalog','pg_toast')
  AND n.nspname NOT LIKE 'pg_temp_%' AND n.nspname NOT LIKE 'pg_toast_temp_%'
ORDER BY n.nspname,c.relname;

-- Review any pre-existing Aurora APIs/privileges. No function is called here.
SELECT n.nspname AS schema_name,p.proname AS function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,p.proacl AS access_control
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname LIKE 'aurora_%' OR (n.nspname='public' AND p.proname LIKE 'aurora_%')
ORDER BY n.nspname,p.proname;

-- Browser roles must not have access to any existing private Aurora schema.
SELECT n.nspname AS schema_name,
       pg_catalog.has_schema_privilege('anon',n.oid,'USAGE') AS anon_usage,
       pg_catalog.has_schema_privilege('authenticated',n.oid,'USAGE') AS authenticated_usage
FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('aurora_migration','aurora_runtime');
