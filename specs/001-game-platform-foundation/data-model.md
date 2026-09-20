# Phase 1 Data Model: Mobile Game Platform Foundation

**Feature**: `001-game-platform-foundation` | **Date**: 2026-08-18

## Design rules

Three rules govern everything below, and each exists to make a spec requirement
structurally true rather than merely intended.

1. **Ownership is the auth user id.** Every player-owned row is keyed by
   `auth.users.id`. Because identity linking (R5) preserves that id through the
   anonymous-to-Google upgrade, "progress is retained on upgrade" (FR-004,
   SC-004) requires no data movement at all.
2. **A save is a versioned document, not a column set.** The payload is opaque
   JSON owned by the game, tagged with `schema_version`. The platform never
   interprets it, so adding a game never means a migration (FR-012, FR-023).
3. **Every conflict is decidable from the record itself.** `revision` plus
   `updated_at` plus `device_id` are always present, so two devices can reach the
   same verdict without consulting a server (FR-015, SC-007).

## Entity overview

```text
auth.users (Supabase-managed)
    │ 1:1
    ▼
profiles ──────────┬──────────────┬──────────────────┐
                   │ 1:N          │ 1:N              │ 1:N
                   ▼              ▼                  ▼
             save_records      scores         transfer_codes
```

`sync_queue` and the local mirror of `save_records` exist **only on the device**
and have no server counterpart.

---

## Entities

### Player Profile — `public.profiles`

The player as the app understands them. Created automatically by trigger the
moment an auth user appears, including an anonymous one, so a profile always
exists and no code path must handle its absence.

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | FK → `auth.users(id)` `ON DELETE CASCADE`. The ownership key everywhere. |
| `display_name` | `text` | Nullable. Generated friendly name for anonymous players. |
| `avatar_url` | `text` | Nullable. Populated from Google profile on link. |
| `is_anonymous` | `boolean` | Mirrors the auth tier so the UI can decide what to offer without inspecting a JWT. |
| `created_at` | `timestamptz` | Default `now()`. |
| `updated_at` | `timestamptz` | Maintained by trigger. |

**Rules**: `is_anonymous` flips to `false` on identity link and must never flip
back — a linked account is permanent. RLS: a player may select and update only
their own row, and may never insert or delete it (the trigger owns creation, and
cascade owns deletion).

---

### Save Record — `public.save_records`

The unit of persisted progress, and the entity the whole design turns on.

| Field | Type | Notes |
|---|---|---|
| `owner_id` | `uuid` | PK part 1. FK → `auth.users(id)` `ON DELETE CASCADE`. |
| `key` | `text` | PK part 2. Namespaced, see below. |
| `data` | `jsonb` | The game's opaque payload. Default `'{}'`. |
| `schema_version` | `integer` | Version of `data`'s shape. Drives migration. Default `1`. |
| `revision` | `bigint` | Monotonic per `(owner_id, key)`. Primary conflict input. Default `1`. |
| `device_id` | `text` | Last writer. Diagnostic, and a tiebreak of last resort. |
| `updated_at` | `timestamptz` | Secondary conflict input, used only on equal revisions. |

**Composite primary key** `(owner_id, key)`. This is what enforces FR-011: a save
is unreachable without its owner, so cross-player access is impossible by
construction rather than by policy alone.

**Key namespace** — a flat string with a reserved prefix grammar:

| Pattern | Purpose | Example |
|---|---|---|
| `platform:<name>` | Platform-owned state | `platform:preferences` |
| `game:<gameId>:<slot>` | Game-owned state | `game:tap-rush:progress` |

A game may only read and write under its own `game:<its own id>:` prefix. The
platform hook injects the prefix, so a game cannot address another game's data
even by mistake — the second half of FR-011.

**Revision semantics**: a write sets `revision = previous + 1`. A conditional
write supplies `expectedRevision`; a mismatch means someone else wrote first and
returns a conflict rather than overwriting. This is optimistic concurrency, and it
is what turns "last write wins" from an accident into a choice.

**RLS**: full CRUD restricted to `owner_id = auth.uid()`. Reassignment during
transfer is deliberately *not* permitted to clients and happens only inside the
redemption function (R10).

---

### Score Entry — `public.scores`

Separate from save records because scores are comparable across players, whereas a
save is private state. Keeping them apart avoids the temptation to expose a whole
save payload in order to show a leaderboard.

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Default `gen_random_uuid()`. |
| `owner_id` | `uuid` | FK → `auth.users(id)` `ON DELETE CASCADE`. |
| `game_id` | `text` | Matches a `GameDefinition.id`. Intentionally not a FK — games live in code. |
| `value` | `bigint` | Higher is better by convention; a game declares direction in its definition. |
| `metadata` | `jsonb` | Optional context (duration, level, mode). Default `'{}'`. |
| `is_validated` | `boolean` | **Default `false`.** True only after server-side validation. |
| `achieved_at` | `timestamptz` | Default `now()`. |

**`is_validated` is the honest part of this table.** Client-submitted values are
untrusted input (FR-030), so the column records that fact in the data rather than
in a comment. Until server-side validation exists, every row is `false` and no UI
may present these as a verified ranking.

**Indexes**: `(game_id, value DESC)` for future ranking, `(owner_id, game_id)` for
a player's own history.

**RLS**: a player may insert and select their own rows; updates and deletes are
denied outright, because a score history that the client can rewrite is not a
history. `is_validated` is not client-writable.

---

### Transfer Code — `public.transfer_codes`

A bearer credential for an entire progress history, so it is modelled as a
credential: hashed at rest, expiring, single-use, attempt-limited.

| Field | Type | Notes |
|---|---|---|
| `code_hash` | `text` PK | SHA-256 of the normalized code. **The plaintext is never stored.** |
| `owner_id` | `uuid` | FK → `auth.users(id)` `ON DELETE CASCADE`. Whose progress this moves. |
| `created_at` | `timestamptz` | Default `now()`. |
| `expires_at` | `timestamptz` | Default `now() + interval '24 hours'`. |
| `redeemed_at` | `timestamptz` | Null until redeemed. Non-null makes the code dead. |
| `redeemed_by` | `uuid` | Claiming user. Audit trail for a destructive operation. |
| `attempt_count` | `integer` | Failed redemption attempts. Feeds throttling. Default `0`. |

**Code format**: 12 characters from a 32-symbol alphabet excluding `0 O 1 I L`,
displayed grouped as `XXXX-XXXX-XXXX`. That is ~60 bits — infeasible to guess
against throttling — while staying transcribable by hand between two phones,
which is the actual use case (R10).

**Validity** requires all of: hash matches, `redeemed_at IS NULL`,
`expires_at > now()`. Redemption reassigns `save_records.owner_id` and marks the
code redeemed **in one transaction**, so a mid-transfer failure cannot orphan
progress.

**RLS**: clients may **not** select this table at all — reading it would leak
which codes exist and against whom. Insert is restricted to one's own
`owner_id`. All redemption goes through the `SECURITY DEFINER` function, which is
also where throttling is enforced, because a client-side limit is not a limit.

---

### Game Definition — code only, no table

Lives in `src/core/games/registry.ts`. Deliberately not persisted: games ship with
the binary, and a database row describing a game would be a second source of truth
that could disagree with the code.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable slug. Becomes part of every save key, so **renaming it orphans saves**. |
| `title`, `description`, `icon` | display | Rendered by the hub. |
| `component` | React component | The game's entry screen. |
| `saveSchema` | Zod schema | Validates and types the payload. |
| `saveVersion` | `number` | Current `schema_version` this game writes. |
| `migrations` | record | `version → (data) => data`, applied in ascending order. |
| `scoring` | object \| null | `{ direction, conflictStrategy }`, or null for unscored games. |

---

### Sync Queue Entry — device-local only

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Local ULID, sortable by creation. |
| `key` | `string` | Target save key. |
| `payload` | `unknown` | Serialized record to replicate. |
| `attempts` | `number` | Retry count, driving exponential backoff. |
| `lastError` | `string?` | Redacted message for diagnostics. |
| `createdAt` | `string` | ISO timestamp. |

Persisted in AsyncStorage so it survives process death (FR-014). Coalescing rule:
a newer entry for the same `key` **replaces** an older pending one, because
replicating superseded intermediate states wastes requests and can resurrect stale
data if they land out of order.

---

## Conflict resolution

Given a local and a remote record for one key:

1. **Higher `revision` wins.** Handles the ordinary case, and never consults a
   clock — which is why a wrong device clock cannot corrupt normal operation.
2. **Equal `revision` means genuine divergence.** Both devices branched from the
   same base, so the configured named strategy decides:

| Strategy | Verdict | Use for |
|---|---|---|
| `last-write-wins` | Later `updated_at`; `device_id` breaks exact ties | Settings, mutable state |
| `highest-value` | Larger value at the configured path | Best scores, unlocks |
| `prefer-local` | Local always | Device-authoritative state |
| `prefer-remote` | Remote always | Server-authoritative state |
| custom | Game-supplied resolver | Anything genuinely mergeable |

3. **A tie-resolved record is written at `revision + 1`**, so the decision is
   itself a recorded fact and the same tie cannot be re-resolved on every
   subsequent sync. A record that won on revision alone (step 1) is kept as-is —
   there was no divergence to record.

The winner must be a pure function of the two records, identical on every device
(SC-007). Clock skew is contained by step 1 handling the common case and step 2
being reachable only on true ties.

---

## Migrations

Ordered SQL files applied by the container's init directory on first boot, and by
`npm run db:migrate` afterwards.

| File | Contents |
|---|---|
| `0001_init.sql` | `profiles`, `save_records`, `scores`; RLS enabled with policies; `updated_at` triggers; `handle_new_user` trigger creating a profile for every new auth user including anonymous |
| `0002_transfer_codes.sql` | `transfer_codes`; RLS denying client reads; `redeem_transfer_code(text)` as `SECURITY DEFINER` with expiry, single-use, and throttle checks |

**RLS is enabled in the same migration that creates each table**, never a later
one. A table that exists for even one migration without RLS is a table that can
ship without it.

Payload migrations are separate and client-side: a game declares `migrations` in
its definition, and the platform applies them in ascending order when a loaded
record's `schema_version` is below `saveVersion`, then writes the upgraded record
back.

---

## Traceability

| Requirement | Where it is satisfied |
|---|---|
| FR-004 / SC-004 progress survives upgrade | `owner_id` is the auth id, unchanged by linking |
| FR-011 per-player, per-game isolation | Composite PK + enforced key prefix |
| FR-012 / SC-012 versioned saves | `schema_version` + declared `migrations` |
| FR-014 durable queue | `sync_queue` in AsyncStorage |
| FR-015 / SC-007 deterministic conflicts | `revision` → named strategy → recorded resolution |
| FR-018 single-use expiring codes | `redeemed_at`, `expires_at` checked in the function |
| FR-019 codes never stored in plaintext | `code_hash` is the primary key; no plaintext column exists |
| FR-020 throttling | `attempt_count` enforced server-side |
| FR-026 / SC-009 RLS everywhere | Enabled per table at creation; `check:rls` gate |
| FR-030 untrusted scores | `is_validated` defaults false, not client-writable |
