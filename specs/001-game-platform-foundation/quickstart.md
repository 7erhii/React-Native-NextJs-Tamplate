# Quickstart: Mobile Game Platform Foundation

**Feature**: `001-game-platform-foundation` | **Date**: 2026-08-18

Two paths. Take the first one if you just want to see the app run.

## Path A — Run with no backend (2 minutes)

The default configuration is device-local, so nothing external is required. This
is User Story 1, and it works with networking off.

```bash
npm install
npm start          # then press i / a, or scan with Expo Go
```

You get a main screen, a playable reference game, and progress that survives a
restart. No account, no Docker, no configuration.

## Path B — Add the containerized database and Google auth

### 1. Bring up the stack

```bash
cd infra/supabase
cp .env.example .env        # then edit; see step 2
./bootstrap.sh              # fetches the pinned upstream compose stack
docker compose up -d
```

Studio lands on <http://localhost:54323>, the API gateway on
<http://localhost:54321>. Migrations in `infra/supabase/migrations/` apply on the
database's first boot.

### 2. Fill in `infra/supabase/.env`

Placeholders only in the committed template. Generate real values locally:

```bash
openssl rand -hex 32        # POSTGRES_PASSWORD, JWT_SECRET
```

`ANON_KEY` and `SERVICE_ROLE_KEY` are JWTs signed with your `JWT_SECRET`; the
bootstrap script prints the command that derives them.

**The `SERVICE_ROLE_KEY` never leaves this file.** It must not appear in
`.env` at the project root, in `app.json`, or in any `EXPO_PUBLIC_*` variable.
Anything prefixed `EXPO_PUBLIC_` is compiled into the shipped bundle and is
readable by anyone who downloads the app.

### 3. Configure Google OAuth

In Google Cloud Console create an **OAuth 2.0 Web application** client. The web
client type is correct even for a mobile app here, because the token exchange
happens in the auth container, not on the device — the device never holds the
secret.

Authorized redirect URI:

```text
http://localhost:54321/auth/v1/callback
```

Put the id and secret in `infra/supabase/.env` as `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`, then `docker compose up -d` to apply.

### 4. Point the app at the stack

Project root `.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from step 2>
```

On a physical device, `localhost` is the phone, not your machine — use your LAN
IP (`http://192.168.x.x:54321`) and add it to the auth redirect allow-list.

### 5. Flip the switch

```ts
// src/config/app.config.ts
export const appConfig = {
  persistence: { mode: 'hybrid', conflictStrategy: 'last-write-wins', ... },
  identity:    { mode: 'google' },
  features:    { transferCodes: true },
} as const;
```

Restart. Same game code, now cloud-synced with optional Google sign-in.

---

## Switching persistence

This is the point of the project. Change **one file**, `src/config/app.config.ts`,
and nothing else.

| Goal | `persistence.mode` | `identity.mode` | Backend needed |
|---|---|---|---|
| No backend at all, progress on device | `local` | `device` | no |
| Cloud saves, no registration | `hybrid` | `anonymous` | yes |
| Cloud saves + optional Google account | `hybrid` | `google` | yes |
| Cloud-only, fail loudly when offline | `cloud` | `google` | yes |

Two combinations are rejected at startup because they cannot work:

- `cloud`/`hybrid` with `identity.mode: 'device'` — no authenticated principal, so
  row-level security would reject every write.
- `transferCodes: true` with `mode: 'local'` — no remote to transfer within.

The error names the offending setting. It fails at startup rather than at first
save, because a game that appears to save and does not is the worst outcome here.

### Choosing a conflict strategy

`last-write-wins` is the default and is right for settings and mutable state. It
is **wrong for a high score** — it discards a better result whenever a worse one
was written later. For score-like values use `highest-value`, globally or per game
via `scoring.conflictStrategy` in the game's definition.

---

## Adding a game

```text
src/games/my-game/
├── definition.ts
├── screen.tsx
└── save.ts
```

Then one import and one array entry in `src/core/games/registry.ts`. The game
appears on the hub with working persistence and identity.

Inside the screen, use hooks only:

```ts
const { data, save } = useSaveState(myGame);
const { identity } = useIdentity();
```

Never import an adapter, `src/core/supabase/client`, or `@supabase/supabase-js`
from a game — lint will reject it, because that is the import that quietly
destroys the swappability everything else here is built to protect.

---

## Verification

```bash
npm run typecheck
npm run lint
npm test                  # includes the shared adapter contract suite
npm run check:rls         # every player-data table has RLS
npm run check:secrets     # no privileged key committed
```

To confirm the switchability claim yourself: change `persistence.mode`, run
`git diff --stat`, and check that exactly one file changed.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Every write fails with a permission error | Signed in as device tier against a cloud mode, or RLS policies not applied |
| OAuth opens then returns with nothing | Redirect URI mismatch, or app scheme missing from the auth allow-list |
| Works in simulator, not on device | `localhost` points at the phone; use your LAN IP |
| Anonymous sign-in rejected | Anonymous users not enabled in the auth container |
| Upgrade creates a second empty profile | Manual linking not enabled, so `linkIdentity` fell back to a new user |
| Container starts then exits | `JWT_SECRET` shorter than 32 characters, or `.env` missing |
