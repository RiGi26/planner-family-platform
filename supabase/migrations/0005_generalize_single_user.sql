-- 0005 — generalize: the family model comes out.
--
-- Masume was designed for three people in one household; it is now a general app
-- headed for the stores. The household machinery — the table, the cross-member
-- RLS windows, the denormalised progress_summary that existed only so family
-- members could read each other's numbers — loses its reason to exist, and every
-- policy collapses to own-rows-only. Shorter policies are harder to get wrong.
--
-- Ordering in this file is load-bearing:
--   * policies referencing current_household_id() are dropped before the function,
--     and the function is dropped WITHOUT cascade so nothing else can be swept
--     silently;
--   * handle_new_user() is replaced before progress_summary is dropped — plpgsql
--     bodies are late-bound, and the old body inserts into that table, so dropping
--     first would break every subsequent signup with an opaque "Database error
--     saving new user";
--   * claim_invite's return type changes (it used to return the household the
--     invite carried), and CREATE OR REPLACE refuses return-type changes (42P13),
--     so it is dropped and recreated;
--   * households goes last, after every reference to it is gone.

-- 1 ── policies that widen beyond the owner, or touch objects about to go
drop policy if exists households_select on public.households;
drop policy if exists profiles_select on public.profiles;
drop policy if exists daily_progress_select on public.daily_progress;
drop policy if exists progress_summary_select on public.progress_summary;
drop policy if exists progress_summary_insert_own on public.progress_summary;
drop policy if exists progress_summary_update_own on public.progress_summary;
drop policy if exists progress_summary_delete_own on public.progress_summary;

-- 2 ── own-only replacements
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy daily_progress_select on public.daily_progress
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 3 ── signup trigger stops touching progress_summary (BEFORE the table is dropped)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 4 ── the family-only objects
drop function if exists public.current_household_id();
drop table if exists public.progress_summary;

-- 5 ── household columns come off profiles and invites
drop index if exists public.profiles_household_id_idx;
alter table public.profiles drop column if exists household_id;

drop index if exists public.invites_household_id_idx;
alter table public.invites drop column if exists household_id;

-- 6 ── claim_invite no longer has a household to return. It now answers the only
--      question the caller ever had: did this claim succeed? The conditional
--      UPDATE stays — that atomicity is what stops two people racing for the last
--      use from both winning. Return type changes, so drop + create.
drop function if exists public.claim_invite (text);

create function public.claim_invite(p_code text)
returns boolean
language sql
security definer
set search_path to ''
as $$
  with claimed as (
    update public.invites
       set used_count = used_count + 1
     where code = p_code
       and used_count < max_uses
       and (expires_at is null or expires_at > now())
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- release_invite is unchanged in shape; recreated for completeness of this file's
-- story and to keep both invite functions defined in the same place going forward.
create or replace function public.release_invite(p_code text)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.invites
     set used_count = greatest(0, used_count - 1)
   where code = p_code;
$$;

-- Recreating a function resets its ACL to the default PUBLIC grant, so the 0004
-- lockdown is restated rather than assumed.
revoke execute on function public.claim_invite (text) from public, anon, authenticated;
revoke execute on function public.release_invite (text) from public, anon, authenticated;
grant execute on function public.claim_invite (text) to service_role;
grant execute on function public.release_invite (text) to service_role;

-- 7 ── and finally the table everything above stopped pointing at
drop table if exists public.households;
