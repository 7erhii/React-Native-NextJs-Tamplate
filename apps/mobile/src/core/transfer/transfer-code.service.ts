/**
 * Transfer codes: moving an anonymous player's progress to another device.
 *
 * This is the answer to "how do games with no registration still move progress
 * between devices". The player writes down a short code on the old device and
 * types it on the new one.
 *
 * A code grants access to an entire progress history, so it is handled as a
 * credential and not as a convenience token: generated from a CSPRNG, stored
 * only as a hash, single-use, expiring, throttled, and never logged. The
 * plaintext exists only in memory and on the player's screen.
 */

import * as Crypto from 'expo-crypto';
import { z } from 'zod';

import { appConfig } from '@/config/app.config';
import { AppError, NotSupportedError } from '@/core/errors';
import { createLogger } from '@/core/logging';
import { requireCurrentOwner } from '@/core/session/current-owner';
import { getSupabase } from '@/core/supabase/client';

const log = createLogger('transfer');

/**
 * Excludes 0/O and 1/I/L. The player transcribes this by hand between two
 * phones, so ambiguity is a correctness problem, not a nicety.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 12;
const GROUP_SIZE = 4;

export const TRANSFER_TABLE = 'transfer_codes';
export const REDEEM_FUNCTION = 'redeem_transfer_code';

export interface GeneratedTransferCode {
  /** Grouped for display, e.g. `A7K2-9MPQ-XT4B`. Never persisted, never logged. */
  code: string;
  expiresAt: string;
}

export type RedeemOutcome =
  | { status: 'ok'; recordsMoved: number }
  | { status: 'not-found' }
  | { status: 'expired' }
  | { status: 'already-redeemed' }
  | { status: 'throttled' }
  | { status: 'error'; message: string };

/** Strips formatting so `a7k2-9mpq` and `A7K29MPQ` hash identically. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function formatCode(raw: string): string {
  return (
    normalizeCode(raw)
      .match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g'))
      ?.join('-') ?? raw
  );
}

/**
 * Rejection sampling rather than plain modulo: with a 31-symbol alphabet, `%`
 * over 256 would make the first symbols measurably likelier, shrinking the
 * effective keyspace of a credential whose only defence is being unguessable.
 */
function randomCode(): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let code = '';

  while (code.length < CODE_LENGTH) {
    const bytes = Crypto.getRandomBytes(CODE_LENGTH * 2);
    for (const byte of bytes) {
      if (code.length >= CODE_LENGTH) break;
      if (byte < limit) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

async function hashCode(normalized: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalized, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

function assertEnabled(): void {
  if (!appConfig.features.transferCodes) {
    throw new NotSupportedError(
      'Transfer codes are disabled. Set features.transferCodes to true in packages/config/src/app.config.ts.',
    );
  }
}

export interface CreateTransferCodeOptions {
  ttlHours?: number;
}

export async function createTransferCode(
  options: CreateTransferCodeOptions = {},
): Promise<GeneratedTransferCode> {
  assertEnabled();

  const ownerId = requireCurrentOwner();
  const plaintext = randomCode();
  const codeHash = await hashCode(plaintext);
  const expiresAt = new Date(Date.now() + (options.ttlHours ?? 24) * 3_600_000).toISOString();

  const { error } = await getSupabase().from(TRANSFER_TABLE).insert({
    code_hash: codeHash,
    owner_id: ownerId,
    expires_at: expiresAt,
  });

  if (error) {
    throw new AppError('unknown', `Could not create a transfer code: ${error.message}`, {
      cause: error,
    });
  }

  // Note what happened, never what the code is.
  log.info('Transfer code issued', { expiresAt });

  return { code: formatCode(plaintext), expiresAt };
}

const redeemResultSchema = z.object({
  status: z.string(),
  records_moved: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
});

/**
 * Redemption happens entirely inside a `SECURITY DEFINER` database function.
 * The claiming user has no row-level-security right to touch progress they do
 * not yet own — which is exactly the operation's purpose — and reassignment must
 * be atomic, or a mid-transfer failure could split a history between two owners.
 *
 * The plaintext code is sent over TLS and hashed by the database. Sending the
 * hash instead would make a leaked `transfer_codes` table directly replayable,
 * which would defeat the point of hashing it at rest.
 */
export async function redeemTransferCode(input: string): Promise<RedeemOutcome> {
  assertEnabled();

  const normalized = normalizeCode(input);
  if (normalized.length !== CODE_LENGTH) {
    return { status: 'not-found' };
  }

  const { data, error } = await getSupabase().rpc(REDEEM_FUNCTION, { p_code: normalized });

  if (error) {
    log.warn('Transfer redemption failed', { message: error.message });
    return { status: 'error', message: error.message };
  }

  const parsed = redeemResultSchema.safeParse(data);
  if (!parsed.success) {
    return { status: 'error', message: 'Unexpected response from the redemption function' };
  }

  if (parsed.data.status === 'ok') {
    log.info('Transfer redeemed', { recordsMoved: parsed.data.records_moved ?? 0 });
    return { status: 'ok', recordsMoved: parsed.data.records_moved ?? 0 };
  }

  switch (parsed.data.reason) {
    case 'expired':
      return { status: 'expired' };
    case 'already_redeemed':
      return { status: 'already-redeemed' };
    case 'throttled':
      return { status: 'throttled' };
    case 'not_found':
      return { status: 'not-found' };
    default:
      return { status: 'error', message: parsed.data.reason ?? 'Redemption refused' };
  }
}

export function describeRedeemOutcome(outcome: RedeemOutcome): string {
  switch (outcome.status) {
    case 'ok':
      return `Progress transferred — ${outcome.recordsMoved} record${
        outcome.recordsMoved === 1 ? '' : 's'
      } moved to this device.`;
    case 'not-found':
      return 'That code does not exist. Check for typos and try again.';
    case 'expired':
      return 'That code has expired. Generate a new one on the other device.';
    case 'already-redeemed':
      return 'That code has already been used. Codes work only once.';
    case 'throttled':
      return 'Too many attempts. Wait a few minutes before trying again.';
    case 'error':
      return outcome.message;
  }
}
