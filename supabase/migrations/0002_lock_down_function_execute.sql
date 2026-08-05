-- 0002_lock_down_function_execute.sql
--
-- Revoking from PUBLIC is not enough on Supabase: default privileges also grant
-- EXECUTE directly to `anon`, `authenticated` and `service_role`. A function can
-- therefore stay callable over /rest/v1/rpc/ after `revoke all ... from public`
-- appears to have locked it — two separate sources of permission, one of them
-- invisible unless you look.
--
-- Always verify with has_function_privilege afterwards rather than assuming:
--   select proname,
--          has_function_privilege('anon', oid, 'EXECUTE'),
--          has_function_privilege('authenticated', oid, 'EXECUTE')
--   from pg_proc where pronamespace = 'public'::regnamespace;

-- Trigger functions. Nothing should ever call these over the API; they fire from
-- their triggers, and PostgreSQL checks EXECUTE at trigger-creation time rather
-- than on every fire, so removing the grant does not break them. Verified by
-- inserting a probe user and confirming the profile and summary rows appeared.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- Referenced by the RLS policies on profiles, daily_progress and progress_summary,
-- which are all `to authenticated` — so signed-in users need it, and anon never
-- reaches a policy that calls it.
revoke all on function public.current_household_id() from public, anon;
grant execute on function public.current_household_id() to authenticated;

-- Not touched: public.rls_auto_enable(). It is a Supabase-managed event trigger
-- that enables RLS on newly created public tables. It returns `event_trigger` and
-- can only run from an event-trigger context, so the linter's warning about it
-- being callable does not correspond to anything reachable.
