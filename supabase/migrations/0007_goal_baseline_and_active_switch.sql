-- 0007 — the goal a learner agrees to, and the safe way to change it.
--
-- Onboarding is the first writer this table has ever had. Two things were
-- missing before it could write anything honest.

-- ---------------------------------------------------------------------------
-- 1 — the pace that was actually agreed to
--
-- computeQuota() warns when today's pace has drifted past twice what the learner
-- signed up for, which requires knowing what they signed up for. It lives on
-- `goals`, not `profiles`: the baseline belongs to THIS target, and moving the
-- exam should reset it. On `profiles` it would be one global number carried
-- silently across goals, firing "unrealistic" against a target already abandoned.
--
-- Nullable, and no backfill. Goals created before this column genuinely have no
-- baseline, and computeQuota treats undefined as "no honesty check" — which is
-- the truth. Guessing a value would be inventing data.
-- ---------------------------------------------------------------------------

alter table public.goals add column if not exists baseline_new_per_day integer;

comment on column public.goals.baseline_new_per_day is
  'New cards per day the learner agreed to when this goal was set. NULL for goals predating 0007. Feeds computeQuota().unrealistic.';

-- ---------------------------------------------------------------------------
-- 2 — switching the active goal atomically
--
-- `goals_one_active_per_user` is a PARTIAL unique index (WHERE is_active), which
-- makes both orderings wrong from the client:
--
--   insert then deactivate  → the insert violates the index and fails outright
--   deactivate then insert  → leaves a window with no active goal at all, and
--                             RequireGoal throws the user back into onboarding
--                             with half their history already written
--
-- PostgREST has no cross-request transaction, so the atomicity has to live here.
--
-- security invoker, not definer: RLS `goals_all_own` stays the thing that decides
-- whose rows these are. The function only needs to be one statement, not
-- privileged.
-- ---------------------------------------------------------------------------

create or replace function public.set_active_goal(
  p_level text,
  p_exam_date date,
  p_baseline integer
)
returns public.goals
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_goal public.goals;
begin
  update public.goals
     set is_active = false
   where user_id = (select auth.uid())
     and is_active;

  insert into public.goals (user_id, target_level, target_exam_date, is_active, baseline_new_per_day)
  values ((select auth.uid()), p_level, p_exam_date, true, p_baseline)
  returning * into v_goal;

  return v_goal;
end;
$$;

-- Same lockdown as 0002 and 0006: creating a function grants EXECUTE to PUBLIC
-- implicitly, and anon has no business calling this.
revoke execute on function public.set_active_goal (text, date, integer) from public, anon;
grant execute on function public.set_active_goal (text, date, integer) to authenticated;
