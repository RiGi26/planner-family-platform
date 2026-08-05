-- 0003_split_write_policies_off_select.sql
--
-- `for all` also covers SELECT, so daily_progress and progress_summary each ended
-- up with two permissive SELECT policies for `authenticated` — and Postgres
-- evaluates every permissive policy on every row it considers.
--
-- Splitting the write policy into INSERT/UPDATE/DELETE leaves exactly one SELECT
-- policy per table. No access is lost: both select policies already match own rows
-- via `user_id = auth.uid()` before widening to the household.

drop policy if exists daily_progress_write_own on public.daily_progress;

create policy daily_progress_insert_own on public.daily_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy daily_progress_update_own on public.daily_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy daily_progress_delete_own on public.daily_progress
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists progress_summary_write_own on public.progress_summary;

create policy progress_summary_insert_own on public.progress_summary
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy progress_summary_update_own on public.progress_summary
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy progress_summary_delete_own on public.progress_summary
  for delete to authenticated
  using (user_id = (select auth.uid()));
