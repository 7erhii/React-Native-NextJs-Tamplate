# Mobile World Constitution

Mobile World is a **reusable foundation** for building small mobile games and
mobile apps. It is not a single product. Every decision below is made in service
of one goal: starting a new game should take hours, not weeks, and should never
require rewriting how identity or persistence works.

## Core Principles

### I. Ports and Adapters (NON-NEGOTIABLE)

Every external capability the app depends on is expressed as a **port**: a
TypeScript interface owned by `apps/mobile/src/core/`. Concrete integrations
are **adapters** that implement a port and live beside it.

- Feature code (screens, games, stores) MUST depend on the port type only.
- Feature code MUST NOT import an adapter, a vendor SDK, or `@supabase/*`
  directly. If a screen imports `supabase`, the design is wrong.
- Adding a new backend means adding an adapter, never editing a screen.

This is what makes the persistence target swappable. It is the reason this
project exists.

### II. One Switch, Not Many

Choosing how the app behaves is a **configuration** act, not a refactor.

- All wiring choices live in exactly one file:
  `packages/config/src/app.config.ts`. Both the Next.js site and the Expo app
  read it.
- Changing persistence from device-local to cloud-synced MUST be a change to
  that file and nothing else.
- Wiring happens in composition-root factories (`apps/mobile/src/core/*/index.ts`).
  No `if (config...)` branches may leak into features.

### III. Authentication Is a Surface, Not a Given

Default is no registration. Markers live in the switch — **not only in the
database**. `authSource: 'config+db'` may overlay a row later; the files still
win when the database is down.

- `web.auth` and `mobile.auth` are independent. A marketing site with Install
  and a logged-in phone is a valid clone. A bank (both true) is also valid.
- When `mobile.authWall` is `none` or `optional`, a user who has never signed
  in is still a real user with real data. The product MUST be usable.
- When `mobile.authWall` is `required`, the home surface is gated until
  `identity.tier === 'account'`. Ignored when `mobile.auth` is false. The wall
  is UI; row-level security still enforces ownership on the server.
- Signing in MUST enrich an existing profile (same `playerId`) rather than
  create a second empty one — including after a required wall.
- The website is `apps/web` (Next.js), never Expo web, never a native route.
  Sign in on that site is `web.auth`. It is not derived from `mobile.authWall`.
- Upgrading from anonymous to a real account MUST preserve all progress.
- When the wall is not required, there MUST be a way to move an anonymous
  profile to a new device (transfer codes or optional sign-in).

### IV. Offline Is the Default, Not a Feature

Mobile networks fail. The app assumes they will.

- Reads MUST resolve from local storage without waiting on the network.
- Writes MUST succeed locally first, then replicate. A failed upload is a
  retryable queue entry, never lost data and never a user-facing error.
- Every sync conflict MUST be resolved by an explicit, named, unit-tested
  strategy. Silent last-write-wins by accident is forbidden; last-write-wins
  chosen deliberately and documented is fine.

### V. A Game Is a Plugin

Games are self-contained modules registered with the platform, not special cases
woven through it.

- A game declares itself once in a registry entry (id, title, entry component,
  save schema, scoring rules).
- A game receives persistence and identity through platform hooks. It MUST NOT
  reach into storage or auth itself.
- Deleting a game's folder and its registry entry MUST fully remove it, leaving
  no dangling references.

### VI. Typed Boundaries, Validated Edges

- TypeScript `strict` is on. `any` requires an inline justification comment.
- Data crossing a trust boundary (network responses, stored JSON, deep links)
  MUST be schema-validated before use. Persisted shapes carry a version field
  and a migration function.

## Security Requirements

These are hard gates, not preferences.

- **Row Level Security is mandatory.** Every table holding player data has RLS
  enabled with policies restricting access to the owning user. A table without
  RLS does not ship.
- **The service-role key never reaches the client.** It exists only in
  server-side environments. The client uses the anon key exclusively.
- **Secrets live in the environment**, never in source, never in `app.json`,
  never in a committed `.env`. Only `.env.example` with placeholders is
  committed.
- **OAuth uses PKCE** with an app-scheme redirect. No implicit flow, no client
  secret embedded in the app.
- **Transfer codes** are single-use, expiring, rate-limited, and stored only as
  a hash. Redemption happens in a `SECURITY DEFINER` function that verifies
  ownership. Codes are never logged.
- **Logs are redacted.** Tokens, emails, transfer codes, and full user ids are
  never written to logs or analytics in plain form.
- Client-reported scores are treated as **untrusted input**. Any competitive
  leaderboard requires server-side validation before it can be called fair.

## Development Workflow

- **Spec first.** A feature starts as a spec in `specs/`, then a plan, then
  tasks. Code follows.
- **Constitution gate.** A plan MUST include a Constitution Check. Violations
  are either fixed or recorded in the plan's Complexity Tracking table with a
  justification and the rejected simpler alternative.
- **Ports are tested against contracts.** A port's test suite runs against every
  adapter that implements it, so adapters stay interchangeable in fact and not
  just in type.
- **Incremental delivery.** User stories are prioritized and independently
  shippable. P1 alone must produce something demonstrable.

## Governance

This constitution supersedes convention, habit, and preference. When a change
conflicts with it, either the change or the constitution must yield explicitly,
in writing.

- Amendments require a version bump, a dated entry, and a note on what code must
  migrate.
- Reviews verify compliance with Principles I, II, and the Security
  Requirements. These three are where this codebase rots first if unwatched.
- Complexity must justify itself. Absent a concrete, present need, the simpler
  option wins.

**Version**: 1.2.0 | **Ratified**: 2026-08-18 | **Last Amended**: 2026-09-17
