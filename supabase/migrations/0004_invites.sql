-- 0004 — invites: the table behind the one door into the app.
--
-- ⚠ RECONSTRUCTED. This migration was applied to production (project
-- wiitzbbsdsvltjbixowm, recorded version 20260805034746, name `0004_invites`)
-- straight from a session buffer without the file ever being written to the repo.
-- This file was rebuilt on 2026-08-05 from a full introspection of the live
-- schema — columns, constraints, indexes, RLS state, grants, and both function
-- bodies via pg_get_functiondef — so it reproduces what production actually runs.
--
-- DO NOT apply this to the production project: it is already there. It exists so
-- that a fresh database can be built from migrations alone, and so that 0005 has
-- a reviewable baseline to diff against.

-- ---------------------------------------------------------------------------
-- invites
--
-- A code is a bearer credential for one (or max_uses) signups. It carries the
-- household the new account should land in; the redeem-invite Edge Function
-- claims a use, sends the email invitation, and links the profile.
-- ---------------------------------------------------------------------------

create table if not exists public.invites (
  code         text primary key,
  label        text not null default '',
  household_id uuid references public.households (id) on delete set null,
  max_uses     smallint not null default 1 check (max_uses > 0),
  used_count   smallint not null default 0 check (used_count >= 0),
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists invites_household_id_idx on public.invites (household_id);

-- RLS on with ZERO policies — deny-all, on purpose. No client role can read or
-- write invite codes; the service role inside the Edge Function bypasses RLS and
-- is the only consumer. An anon SELECT returning zero rows is the correct outcome.
alter table public.invites enable row level security;

-- ---------------------------------------------------------------------------
-- claim / release
--
-- The conditional UPDATE makes the claim atomic: two people racing for the last
-- use cannot both win. release_invite exists so a mail failure can hand the use
-- back instead of silently burning someone's invite.
-- ---------------------------------------------------------------------------

create or replace function public.claim_invite(p_code text)
returns table (household_id uuid)
language sql
security definer
set search_path to ''
as $$
  update public.invites
     set used_count = used_count + 1
   where code = p_code
     and used_count < max_uses
     and (expires_at is null or expires_at > now())
  returning invites.household_id;
$$;

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

-- Same lockdown pattern as 0002: EXECUTE for the service role only. `public` gets
-- an implicit grant on function creation, and anon/authenticated must not be able
-- to probe or burn codes from the client.
revoke execute on function public.claim_invite (text) from public, anon, authenticated;
revoke execute on function public.release_invite (text) from public, anon, authenticated;
grant execute on function public.claim_invite (text) to service_role;
grant execute on function public.release_invite (text) to service_role;
