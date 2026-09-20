# Contract: Database API and Access Policies

**Feature**: `001-game-platform-foundation` | **Implements**: FR-026 – FR-033

The server-side contract: tables reached over PostgREST, one privileged function,
and the access policies that make client-side ownership checks unnecessary.

## Access model

The client authenticates as a Supabase user — anonymous or Google-linked — and
holds only the **anon key**. Every request carries the user's JWT and every table
decision is made by row-level security in the database. The client never filters by
owner for security reasons; it filters only for efficiency. This distinction
matters: if RLS were removed, the app would keep working and quietly expose
everything, so RLS is verified by an automated gate (`npm run check:rls`) rather
than trusted.

## Tables

### `profiles`

| Operation | Allowed | Policy |
|---|---|---|
| `SELECT` | own row | `id = auth.uid()` |
| `UPDATE` | own row, `display_name` / `avatar_url` only | `id = auth.uid()` |
| `INSERT` | **denied** | created by `handle_new_user` trigger |
| `DELETE` | **denied** | cascades from `auth.users` |

Insert is denied so a profile always corresponds to exactly one auth user. The
trigger fires for anonymous users too, which is why no code path has to handle a
missing profile.

### `save_records`

| Operation | Allowed | Policy |
|---|---|---|
| `SELECT` / `INSERT` / `UPDATE` / `DELETE` | own rows | `owner_id = auth.uid()` |

`owner_id` is **not** client-writable to any value other than `auth.uid()`, which
is what prevents a client from donating or stealing rows. Ownership reassignment
during transfer therefore cannot happen over PostgREST at all — it happens only
inside `redeem_transfer_code`.

Upserts target the composite key `(owner_id, key)`.

### `scores`

| Operation | Allowed | Policy |
|---|---|---|
| `SELECT` | own rows | `owner_id = auth.uid()` |
| `INSERT` | own rows | `owner_id = auth.uid()` |
| `UPDATE` / `DELETE` | **denied** | — |

Immutable by design: a score history the client can rewrite is not a history.
`is_validated` defaults to `false` and is not client-writable, so the data itself
records that these values are unverified (FR-030). Public leaderboard reads are
deliberately absent until server-side validation exists.

### `transfer_codes`

| Operation | Allowed | Policy |
|---|---|---|
| `SELECT` | **denied entirely** | — |
| `INSERT` | own rows | `owner_id = auth.uid()` |
| `UPDATE` / `DELETE` | **denied** | — |

Client reads are denied outright because being able to query this table would
reveal which codes exist and whom they belong to. Redemption needs no read
privilege — the function does it.

## Function: `redeem_transfer_code(p_code text)`

`SECURITY DEFINER`, the only privileged operation in the system.

```sql
redeem_transfer_code(p_code text) returns jsonb
```

Steps, all in one transaction:

1. Require an authenticated caller; reject anonymous-less requests.
2. Hash the normalized code and look up the row.
3. Reject when not found, already redeemed, or expired — incrementing
   `attempt_count` where a row exists.
4. Reject when `attempt_count` exceeds the throttle limit (FR-020).
5. Reject when the caller already owns the profile (self-transfer is a no-op).
6. Reassign every `save_records` row from `owner_id` to the caller.
7. Mark the code `redeemed_at` / `redeemed_by`.
8. Return a summary of what moved.

Returns `{ status: 'ok', records_moved: n }` or
`{ status: 'error', reason: 'not_found' | 'expired' | 'already_redeemed' | 'throttled' }`.

`SECURITY DEFINER` is required precisely because the caller has no RLS right to
touch rows they do not yet own — that is the operation's whole purpose. The
function is the narrow, auditable hole through which that happens, and it must be
`REVOKE`d from `public` and granted only to `authenticated`.

Atomicity is not optional here: a partial reassignment would leave a player's
progress split between two owners with no way to reunite it.

## Auth service configuration

Set in the container environment, never in client code:

| Setting | Value | Why |
|---|---|---|
| anonymous users | enabled | Cloud saves with no registration (R3) |
| manual linking | enabled | Progress-preserving upgrade via `linkIdentity` (R5) |
| Google provider | enabled, client id + secret | Server-side confidential client |
| redirect allow-list | app scheme + `localhost` for web dev | Blocks redirect hijacking |
| JWT expiry | 3600 s, refresh rotation on | Limits stolen-token lifetime |

## Migrations

| File | Contents |
|---|---|
| `0001_init.sql` | `profiles`, `save_records`, `scores`; RLS **enabled in the same statement block that creates each table**; `updated_at` triggers; `handle_new_user` |
| `0002_transfer_codes.sql` | `transfer_codes`; deny-read policy; `redeem_transfer_code` with grants |

A table must never exist in a migration that does not also enable its RLS. A table
that is unprotected for even one migration is a table that can reach production
unprotected.

## Security notes

- **Risks**: cross-player reads if RLS is missing or misconfigured; privilege
  escalation through the `SECURITY DEFINER` function; transfer-code brute force;
  service-role key leaking into a client bundle; redirect hijacking during OAuth.
- **Assumptions**: Postgres is not directly reachable from the internet; only the
  gateway is exposed; the service-role key exists solely in server-side
  environments; container `.env` is never committed.
- **Safeguards**: RLS on every player-data table, asserted by an automated gate;
  the definer function validates ownership, expiry, single use, and a throttle
  before touching a row, and is revoked from `public`; codes stored only as
  SHA-256 hashes and never logged; an explicit redirect allow-list; a committed
  `.env.example` containing placeholders only; a repository secret scan wired into
  CI.
- **Residual risk**: anonymous user rows accumulate without bound. A retention
  policy is required before production and is tracked as a follow-up.
