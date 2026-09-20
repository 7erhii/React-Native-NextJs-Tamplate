# Contract: Identity Port

**Feature**: `001-game-platform-foundation` | **Implements**: FR-001 – FR-007

The port every feature uses to learn who the player is. Three adapters implement
it and must be interchangeable in fact, not just in type.

## Interface

```ts
export type IdentityTier = 'device' | 'anonymous' | 'account';

export interface PlayerIdentity {
  /** Ownership key for every save record. Stable across an anonymous→account upgrade. */
  playerId: string;
  tier: IdentityTier;
  displayName: string;
  avatarUrl?: string;
  /** Present only when tier === 'account'. */
  email?: string;
  /** True when this identity can still be upgraded to a real account. */
  canUpgrade: boolean;
  /** True when progress can reach another device under this identity. */
  supportsCrossDevice: boolean;
}

export interface IdentityCapabilities {
  /** Whether any sign-in affordance should render at all (FR-006). */
  canSignIn: boolean;
  canUpgrade: boolean;
  canTransfer: boolean;
  providers: readonly AuthProvider[];
}

export type AuthProvider = 'google';

export type SignInOutcome =
  | { status: 'signed-in'; identity: PlayerIdentity }
  /** Anonymous identity became a real account; playerId unchanged, progress intact. */
  | { status: 'upgraded'; identity: PlayerIdentity }
  /** The target account already exists with its own progress. Caller MUST ask the
   *  player which history to keep — never resolve this silently. */
  | { status: 'conflict'; existing: AccountSummary; current: PlayerIdentity }
  | { status: 'cancelled' };

export interface IdentityPort {
  /** Adapter id, for diagnostics only. */
  readonly id: string;
  readonly capabilities: IdentityCapabilities;

  /** Resolve the current identity, creating one if none exists.
   *  MUST succeed offline for the device adapter. Never returns null. */
  restore(): Promise<PlayerIdentity>;

  /** Interactive sign-in. Rejects with NotSupportedError when canSignIn is false. */
  signIn(provider: AuthProvider): Promise<SignInOutcome>;

  /** Upgrade the current anonymous identity in place, preserving playerId. */
  upgrade(provider: AuthProvider): Promise<SignInOutcome>;

  /** Returns to an anonymous/device identity. The app stays playable (FR-005). */
  signOut(options?: { discardPendingWrites?: boolean }): Promise<PlayerIdentity>;

  subscribe(listener: (identity: PlayerIdentity) => void): () => void;

  /** Bearer token for cloud adapters. Null for the device adapter. */
  getAccessToken(): Promise<string | null>;
}
```

## Behavioural guarantees

Every adapter must satisfy all of these; the shared contract suite asserts them.

1. **`restore()` never fails and never returns null.** If no identity exists it
   creates one. A caller must never have to handle "no player".
2. **`playerId` is stable.** It changes only on `signOut()` or a `conflict`
   resolved toward the other history. In particular `upgrade()` must not change
   it — this is the mechanism behind SC-004.
3. **Capabilities are honest.** When `canSignIn` is false the UI renders no
   sign-in affordance, and `signIn()` rejects rather than no-oping (FR-006).
4. **Cancellation is inert.** A dismissed flow returns `cancelled` and leaves the
   prior identity and all progress untouched.
5. **Sessions persist in secure storage** across restarts, never in plain
   storage (FR-007).
6. **`conflict` is never auto-resolved.** Two real histories exist; destroying
   either without asking is data loss.
7. **No token, email, or full `playerId` is ever logged.**

## Adapters

| Adapter | Tier | `canSignIn` | Cross-device | Network |
|---|---|---|---|---|
| `device-identity` | `device` | false | false | never |
| `supabase-identity` (anonymous only) | `anonymous` | false | via transfer code | required |
| `supabase-identity` (with Google) | `anonymous` → `account` | true | yes | required |

`device-identity` generates a UUID into secure storage on first call. It is the
only adapter that works with no infrastructure, which is what makes User Story 1
testable with the backend switched off.

`supabase-identity` signs in anonymously on `restore()` so a cloud identity always
exists without player action, then uses `linkIdentity` for `upgrade()` so the user
id survives (R5). Its `signIn()` on an existing anonymous session routes to
`upgrade()`, because the alternative — signing out and in — is exactly the
progress-losing path the spec forbids.

## Failure modes

| Condition | Required behaviour |
|---|---|
| Offline, cloud adapter, no cached session | Reject with a typed `OfflineError`; the app must remain usable in a degraded, clearly-communicated state |
| Offline, cloud adapter, cached session | Succeed from cache; do not block on refresh |
| `signIn` on an adapter with `canSignIn: false` | Reject with `NotSupportedError` |
| OAuth redirect arrives during cold start | Queue and handle after initialization; never drop |
| Token refresh fails | Keep the identity, mark the session stale, retry with backoff |

## Security notes

- **Risks**: session theft from insecure storage; OAuth code interception; silent
  account takeover via a mishandled `conflict`.
- **Assumptions**: GoTrue holds the Google client secret server-side; the app is a
  public OAuth client and therefore uses PKCE; the OS keychain is trustworthy.
- **Safeguards**: PKCE with an app-scheme redirect and no embedded secret;
  sessions in Keychain/Keystore via chunked SecureStore; `conflict` surfaced to
  the player rather than resolved; redacted logging; no privileged key ever
  present in the client.
