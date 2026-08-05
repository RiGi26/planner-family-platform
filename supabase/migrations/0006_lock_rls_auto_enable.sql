-- 0006 — revoke client EXECUTE on the platform's RLS auto-enable helper.
--
-- `rls_auto_enable()` is an event-trigger function (it flips RLS on for every new
-- public table — a safety net worth keeping). Event-trigger functions cannot be
-- invoked directly, so the exposure here is theoretical — but the security advisor
-- flags it, and a store review reads advisor output. Event triggers fire as the
-- owner regardless of this ACL, so revoking costs nothing.

revoke execute on function public.rls_auto_enable () from public, anon, authenticated;
