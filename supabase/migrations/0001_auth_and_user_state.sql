-- 0001_auth_and_user_state.sql
--
-- Per-user state for Masume. Content tables (items, item_examples) arrive in 0002.
--
-- The split is deliberate: content is identical for everyone and read-only, state is
-- per-person and read-write. That keeps RLS simple — content is SELECT for any
-- authenticated user, state is filtered by user_id.
--
-- With `output: 'export'` there is no server checking anything. Route guards in the
-- client are a presentation concern; anyone can walk past them with devtools. RLS is
-- the actual security boundary, so every table below has an explicit policy.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users, created by trigger on signup
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  household_id          uuid references public.households(id) on delete set null,
  display_name          text not null default '',
  level_current         text not null default 'KANA'
                          check (level_current in ('KANA','N5','N4','N3','N2','N1')),
  daily_minutes_target  smallint not null default 20 check (daily_minutes_target between 5 and 240),
  writing_kana_enabled  boolean not null default true,
  -- Kanji writing is off by default on purpose: it is the fastest way to blow a
  -- 30-minute daily budget, and JLPT never tests handwriting.
  writing_kanji_enabled boolean not null default false,
  -- Decides where "today" ends for quota and streak. Changes when someone moves to Japan.
  timezone              text not null default 'Asia/Jakarta',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists profiles_household_id_idx on public.profiles (household_id);

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------

create table if not exists public.goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  target_level     text not null check (target_level in ('N5','N4','N3','N2','N1')),
  target_exam_date date not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals (user_id);

-- At most one active goal per person; superseded goals stay as history.
create unique index if not exists goals_one_active_per_user
  on public.goals (user_id) where is_active;

-- ---------------------------------------------------------------------------
-- card_states — FSRS scheduling state
-- ---------------------------------------------------------------------------

-- Column names mirror the ts-fsrs 5.x `Card` interface exactly so there is no
-- conversion layer between the library and the database.
--
-- Enums are stored as smallint because ts-fsrs uses numeric enums:
--   state  0=New 1=Learning 2=Review 3=Relearning
--   rating 1=Again 2=Hard 3=Good 4=Easy
create table if not exists public.card_states (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Slug from the content dataset (e.g. 'kana-hira-basic-a-3042'). Becomes a FK to
  -- public.items in 0002; kept loose here so the kana dataset can seed before then.
  item_id         text not null,
  mode            text not null check (mode in ('recognition','recall','writing','listening')),

  due             timestamptz not null default now(),
  stability       double precision not null default 0,
  difficulty      double precision not null default 0,
  scheduled_days  integer not null default 0,
  learning_steps  smallint not null default 0,
  reps            integer not null default 0,
  lapses          integer not null default 0,
  state           smallint not null default 0 check (state between 0 and 3),
  last_review     timestamptz,
  -- Deprecated in ts-fsrs v6 — drop this column when upgrading.
  elapsed_days    integer not null default 0,

  updated_at      timestamptz not null default now(),

  -- The key that makes writing a fourth card type rather than a second engine:
  -- 川 can hold a recognition card and a writing card on independent schedules.
  unique (user_id, item_id, mode)
);

create index if not exists card_states_user_id_idx on public.card_states (user_id);
-- The query the daily session runs on every app open.
create index if not exists card_states_due_idx on public.card_states (user_id, due);

-- ---------------------------------------------------------------------------
-- reviews — append-only log
-- ---------------------------------------------------------------------------

create table if not exists public.reviews (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  card_state_id    uuid not null references public.card_states(id) on delete cascade,
  rating           smallint not null check (rating between 1 and 4),
  state_before     smallint not null check (state_before between 0 and 3),
  reviewed_at      timestamptz not null default now(),
  duration_ms      integer,
  -- Writing mode only: how many strokes came out wrong. This is what the automatic
  -- rating is derived from (0 = Good, 1-2 = Hard, 3+ = Again).
  stroke_errors    smallint,
  -- Recall mode only: how many answer cells were revealed before answering.
  hints_used       smallint not null default 0,

  -- Minted on the client *before* sending. Retrying a failed sync can never produce
  -- a duplicate row, which is what "zero data loss" rests on.
  client_review_id uuid not null,

  unique (user_id, client_review_id)
);

create index if not exists reviews_user_id_idx on public.reviews (user_id);
create index if not exists reviews_card_state_id_idx on public.reviews (card_state_id);
create index if not exists reviews_user_reviewed_at_idx on public.reviews (user_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- daily_progress
-- ---------------------------------------------------------------------------

create table if not exists public.daily_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Local date in the profile's timezone, not UTC.
  date         date not null,
  new_done     integer not null default 0,
  review_done  integer not null default 0,
  minutes      integer not null default 0,
  quota_target integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, date)
);

-- Streak is deliberately not a column. It is computed from this table when needed,
-- so it can never drift from the data it claims to summarise.

-- ---------------------------------------------------------------------------
-- kana_sheet — the user's own handwriting
-- ---------------------------------------------------------------------------

create table if not exists public.kana_sheet (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    text not null,
  -- Captured stroke points, always from the Recall stage — never from Trace. The
  -- sheet is meant to hold writing from memory, not tracing.
  strokes    jsonb not null,
  written_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Separate from card_states because it measures something else entirely:
-- kana_sheet answers "have I written this yet?", card_states answers "do I still
-- remember it?". 104 cells per script, written once, rewritable any time.

-- ---------------------------------------------------------------------------
-- progress_summary — the only cross-household window
-- ---------------------------------------------------------------------------

-- The Family Dashboard needs three people readable side by side, but goals and
-- card_states stay private. So the handful of numbers the dashboard actually shows
-- are denormalised here, and nothing else leaks.
--
-- Note what is absent: no readiness score. That belongs to Phase 1, and it is also
-- the one number that would turn this screen into a ranking.
create table if not exists public.progress_summary (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  target_level     text,
  target_exam_date date,
  days_left        integer,
  kana_strong      integer not null default 0,
  kana_total       integer not null default 208,
  kanji_strong     integer not null default 0,
  kanji_total      integer not null default 0,
  vocab_strong     integer not null default 0,
  vocab_total      integer not null default 0,
  grammar_strong   integer not null default 0,
  grammar_total    integer not null default 0,
  behind_days      integer not null default 0,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

-- Must be SECURITY DEFINER. Without it the policy on `profiles` calls itself while
-- evaluating household_id, and recurses until Postgres gives up.
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_household_id() from public;
grant execute on function public.current_household_id() to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists card_states_touch on public.card_states;
create trigger card_states_touch before update on public.card_states
  for each row execute function public.touch_updated_at();

drop trigger if exists daily_progress_touch on public.daily_progress;
create trigger daily_progress_touch before update on public.daily_progress
  for each row execute function public.touch_updated_at();

-- A profile row for every new auth user. Accounts are created from the Supabase
-- dashboard in Phase 0 — there is no signup page, and so no other way in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.progress_summary (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.households      enable row level security;
alter table public.profiles        enable row level security;
alter table public.goals           enable row level security;
alter table public.card_states     enable row level security;
alter table public.reviews         enable row level security;
alter table public.daily_progress  enable row level security;
alter table public.kana_sheet      enable row level security;
alter table public.progress_summary enable row level security;

-- auth.uid() and current_household_id() are wrapped in a scalar subquery so the
-- planner evaluates them once per statement (initplan) instead of once per row.

-- households: readable by its members only.
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (id = (select public.current_household_id()));

-- profiles: own row always; household members readable — this is the Family Dashboard.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (household_id is not null and household_id = (select public.current_household_id()))
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- goals: private. Someone else's exam date is not information anyone needs;
-- the dashboard shows progress, not targets.
drop policy if exists goals_all_own on public.goals;
create policy goals_all_own on public.goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- card_states / reviews: private. Nobody needs to know which cards you keep forgetting.
drop policy if exists card_states_all_own on public.card_states;
create policy card_states_all_own on public.card_states
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists reviews_all_own on public.reviews;
create policy reviews_all_own on public.reviews
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- daily_progress: readable across the household (streaks and "today"), writable only by owner.
drop policy if exists daily_progress_select on public.daily_progress;
create policy daily_progress_select on public.daily_progress
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (
      select p.id from public.profiles p
      where p.household_id is not null
        and p.household_id = (select public.current_household_id())
    )
  );

drop policy if exists daily_progress_write_own on public.daily_progress;
create policy daily_progress_write_own on public.daily_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- kana_sheet: private. It is the user's own handwriting.
drop policy if exists kana_sheet_all_own on public.kana_sheet;
create policy kana_sheet_all_own on public.kana_sheet
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- progress_summary: the denormalised window the household may read.
drop policy if exists progress_summary_select on public.progress_summary;
create policy progress_summary_select on public.progress_summary
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (
      select p.id from public.profiles p
      where p.household_id is not null
        and p.household_id = (select public.current_household_id())
    )
  );

drop policy if exists progress_summary_write_own on public.progress_summary;
create policy progress_summary_write_own on public.progress_summary
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
