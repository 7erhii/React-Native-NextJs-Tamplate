-- ============================================================================
-- 0002_transfer_codes.sql — cross-device progress transfer without an account
--
-- A transfer code is a bearer credential for a player's entire progress history,
-- so it gets credential handling: stored only as a hash, single-use, expiring,
-- and attempt-limited.
--
-- The plaintext code is hashed **inside the database** rather than accepted
-- pre-hashed. That matters: if the hash itself were the accepted input, a leaked
-- table would be directly replayable and hashing would buy nothing.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- transfer_codes
-- ---------------------------------------------------------------------------
create table if not exists public.transfer_codes (
  code_hash   text        primary key,
  owner_id    uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null
);

alter table public.transfer_codes enable row level security;

-- A player may create a code for themselves and nothing else.
--
-- There is deliberately NO select policy: being able to query this table would
-- reveal which codes exist and whom they belong to. Redemption needs no read
-- privilege because the function below runs as its definer. Update and delete
-- have no policies either, so a code cannot be un-redeemed or its expiry moved.
create policy "transfer_codes_insert_own"
  on public.transfer_codes for insert
  with check (owner_id = auth.uid());

create index if not exists transfer_codes_owner_idx on public.transfer_codes (owner_id);

-- ---------------------------------------------------------------------------
-- transfer_attempts — throttling substrate.
--
-- Per-caller rather than per-code, because a brute-force attempt against random
-- codes never finds a row to count against. Counting attempts by the caller is
-- what actually bounds guessing.
-- ---------------------------------------------------------------------------
create table if not exists public.transfer_attempts (
  id           bigserial   primary key,
  actor_id     uuid        not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now(),
  succeeded    boolean     not null default false
);

alter table public.transfer_attempts enable row level security;
-- No policies at all: only the definer function touches this table.

create index if not exists transfer_attempts_actor_time_idx
  on public.transfer_attempts (actor_id, attempted_at desc);

-- ---------------------------------------------------------------------------
-- redeem_transfer_code
--
-- SECURITY DEFINER is required precisely because the caller has no row-level
-- right to touch progress they do not yet own — that is the operation's entire
-- purpose. This function is the narrow, auditable hole through which it happens.
--
-- Everything runs in one transaction: a partial reassignment would split a
-- player's history between two owners with no way to reunite it.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_transfer_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor        uuid := auth.uid();
  v_hash         text;
  v_row          public.transfer_codes;
  v_recent       integer;
  v_moved        integer := 0;
  c_window       interval := interval '15 minutes';
  c_max_attempts integer := 10;
begin
  if v_actor is null then
    return jsonb_build_object('status', 'error', 'reason', 'not_authenticated');
  end if;

  -- Throttle before doing any lookup, so a guessing loop is bounded regardless
  -- of whether the codes it tries exist.
  select count(*) into v_recent
  from public.transfer_attempts
  where actor_id = v_actor
    and succeeded = false
    and attempted_at > now() - c_window;

  if v_recent >= c_max_attempts then
    return jsonb_build_object('status', 'error', 'reason', 'throttled');
  end if;

  -- Normalize exactly as the client does: strip formatting, upper-case, then
  -- hash. 'a7k2-9mpq' and 'A7K29MPQ' must resolve to the same code.
  v_hash := encode(
    digest(upper(regexp_replace(p_code, '[^0-9A-Za-z]', '', 'g')), 'sha256'),
    'hex'
  );

  select * into v_row
  from public.transfer_codes
  where code_hash = v_hash
  for update;

  if not found then
    insert into public.transfer_attempts (actor_id, succeeded) values (v_actor, false);
    return jsonb_build_object('status', 'error', 'reason', 'not_found');
  end if;

  if v_row.redeemed_at is not null then
    insert into public.transfer_attempts (actor_id, succeeded) values (v_actor, false);
    return jsonb_build_object('status', 'error', 'reason', 'already_redeemed');
  end if;

  if v_row.expires_at <= now() then
    insert into public.transfer_attempts (actor_id, succeeded) values (v_actor, false);
    return jsonb_build_object('status', 'error', 'reason', 'expired');
  end if;

  -- Redeeming your own code is a no-op, not an error, but it must not consume
  -- the code or churn ownership.
  if v_row.owner_id = v_actor then
    insert into public.transfer_attempts (actor_id, succeeded) values (v_actor, true);
    return jsonb_build_object('status', 'ok', 'records_moved', 0, 'note', 'same_owner');
  end if;

  -- Reassign ownership. The delete clears any record the claiming device already
  -- holds under the same key, so the incoming progress wins wholesale rather
  -- than colliding with the primary key and aborting the transfer.
  delete from public.save_records
  where owner_id = v_actor
    and key in (select key from public.save_records where owner_id = v_row.owner_id);

  update public.save_records
  set owner_id = v_actor
  where owner_id = v_row.owner_id;

  get diagnostics v_moved = row_count;

  update public.transfer_codes
  set redeemed_at = now(),
      redeemed_by = v_actor
  where code_hash = v_hash;

  insert into public.transfer_attempts (actor_id, succeeded) values (v_actor, true);

  return jsonb_build_object('status', 'ok', 'records_moved', v_moved);
end;
$$;

-- A SECURITY DEFINER function is public by default, which would expose it to
-- unauthenticated callers. Lock it down to signed-in users only.
revoke all on function public.redeem_transfer_code(text) from public;
revoke all on function public.redeem_transfer_code(text) from anon;
grant execute on function public.redeem_transfer_code(text) to authenticated;
