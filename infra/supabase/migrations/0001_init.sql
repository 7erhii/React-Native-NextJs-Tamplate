-- ============================================================================
-- 0001_init.sql — profiles, save records, scores
--
-- Row Level Security is enabled in the same block that creates each table, never
-- in a later migration. A table that exists unprotected for even one migration
-- is a table that can reach production unprotected.
--
-- The client authenticates with the anon key and a user JWT. Every access
-- decision below is made by the database, so the client never filters by owner
-- for security reasons — only for efficiency.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at honest without trusting the client.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, including anonymous ones.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  is_anonymous boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A player sees and edits only their own profile. Insert is absent deliberately:
-- creation belongs to the trigger below, so a profile can never be orphaned from
-- its auth user or duplicated. Delete is absent because it cascades.
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- save_records — the unit of persisted progress.
--
-- The composite primary key is what enforces per-player isolation structurally:
-- a save is unaddressable without its owner.
-- ---------------------------------------------------------------------------
create table if not exists public.save_records (
  owner_id       uuid        not null references auth.users (id) on delete cascade,
  key            text        not null,
  data           jsonb       not null default '{}'::jsonb,
  schema_version integer     not null default 1,
  revision       bigint      not null default 1,
  device_id      text,
  updated_at     timestamptz not null default now(),
  primary key (owner_id, key),
  constraint save_records_key_not_empty check (length(key) > 0),
  constraint save_records_revision_positive check (revision > 0)
);

alter table public.save_records enable row level security;

-- `with check` on insert and update is the part that matters: without it a client
-- could write rows owned by, or hand rows to, another user.
create policy "save_records_select_own"
  on public.save_records for select
  using (owner_id = auth.uid());

create policy "save_records_insert_own"
  on public.save_records for insert
  with check (owner_id = auth.uid());

create policy "save_records_update_own"
  on public.save_records for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "save_records_delete_own"
  on public.save_records for delete
  using (owner_id = auth.uid());

create index if not exists save_records_owner_key_idx
  on public.save_records (owner_id, key);

-- ---------------------------------------------------------------------------
-- scores — comparable across players, therefore separate from private saves.
-- ---------------------------------------------------------------------------
create table if not exists public.scores (
  id           uuid        primary key default gen_random_uuid(),
  owner_id     uuid        not null references auth.users (id) on delete cascade,
  game_id      text        not null,
  value        bigint      not null,
  metadata     jsonb       not null default '{}'::jsonb,
  -- Client-submitted values are untrusted input. This column records that fact
  -- in the data rather than in a comment, and is not client-writable.
  is_validated boolean     not null default false,
  achieved_at  timestamptz not null default now()
);

alter table public.scores enable row level security;

-- Insert and select only. A score history the client can rewrite is not a
-- history, so update and delete have no policies at all.
create policy "scores_select_own"
  on public.scores for select
  using (owner_id = auth.uid());

create policy "scores_insert_own"
  on public.scores for insert
  with check (owner_id = auth.uid() and is_validated = false);

create index if not exists scores_game_value_idx on public.scores (game_id, value desc);
create index if not exists scores_owner_game_idx on public.scores (owner_id, game_id);

-- ---------------------------------------------------------------------------
-- Profile lifecycle.
--
-- Fires for anonymous users too, which is why no application code path has to
-- handle a missing profile.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, is_anonymous)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep the profile in step when an anonymous user links a real identity.
--
-- `is_anonymous` moves in one direction only: an account, once permanent, must
-- never silently revert to anonymous.
-- ---------------------------------------------------------------------------
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    is_anonymous = case
                     when is_anonymous = false then false
                     else coalesce(new.is_anonymous, false)
                   end,
    display_name = coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      display_name
    ),
    avatar_url = coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture',
      avatar_url
    ),
    updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();
