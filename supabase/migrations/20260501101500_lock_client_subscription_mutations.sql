-- Lock subscription billing writes to server-managed payment flows only.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.subscriptions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.invoices FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.usage_tracking FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.payment_history FROM authenticated;

DROP POLICY IF EXISTS "Users can create own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can create own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can insert own usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Users can update own usage" ON public.usage_tracking;