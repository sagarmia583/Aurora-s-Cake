-- Defense in depth for the legacy, currently unused Supabase backend.
-- Live checkout/staff operations in this branch use private Google Sheets.
-- Execute with the schema owner; this migration is intentionally restrictive.
BEGIN;

ALTER TABLE IF EXISTS public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_item_addons ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff,public.staff_roles,public.roles,public.permissions,public.role_permissions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payments,public.deliveries
  FROM anon, authenticated;

DROP POLICY IF EXISTS "Staff view and update orders" ON public.orders;
CREATE POLICY "Authorized staff may read orders" ON public.orders
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'orders.view'));
CREATE POLICY "Staff with update permission may update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'orders.update'))
  WITH CHECK (public.has_permission(auth.uid(),'orders.update'));

DROP POLICY IF EXISTS "Riders view assigned deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Riders update assigned delivery state" ON public.deliveries;

-- The old security-definer create_secure_order RPC contains a simulation that
-- accepts unverified non-COD payment types. It must not be callable by visitors.
DO $$
DECLARE function_signature regprocedure;
BEGIN
  FOR function_signature IN
    SELECT p.oid::regprocedure FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_secure_order'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',function_signature);
  END LOOP;
END $$;

COMMIT;
