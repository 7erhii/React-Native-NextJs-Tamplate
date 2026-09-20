/**
 * The only logger in the app. Everything routes through here so redaction is a
 * property of the system rather than a habit each caller has to remember.
 *
 * Redaction is key-name based and deliberately over-eager: a false positive
 * costs a hidden debug value, a false negative leaks a credential.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACTED = '***REDACTED***';

/**
 * Substrings that mark a value as unloggable, matched case-insensitively.
 *
 * Credential-bearing names are listed specifically rather than as a bare `key`,
 * because `key` also names save-record keys — redacting those would cost real
 * diagnosability while protecting nothing. `code` stays broad: a transfer code is
 * a bearer credential for a player's entire progress, which is worth losing some
 * error-code detail for.
 */
const SENSITIVE_KEY_PATTERNS = [
  'token',
  'password',
  'secret',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'accesskey',
  'access_key',
  'authorization',
  'auth',
  'cookie',
  'session',
  'code',
  'email',
  'jwt',
  'credential',
  'signature',
] as const;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Player ids are not secret, but a full id in a log is a durable identifier we
 * have no reason to keep. Keep enough to correlate a session, not enough to
 * single out a person.
 */
export function redactId(id: string | null | undefined): string {
  if (!id) return 'none';
  return `${id.slice(0, 8)}…`;
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? REDACTED : redact(inner, depth + 1);
    }
    return output;
  }
  return '[unloggable]';
}

function emit(level: Level, scope: string, message: string, context?: unknown): void {
  // Debug output is dropped in production builds; warnings and errors are kept.
  if (level === 'debug' && !__DEV__) return;

  const prefix = `[${scope}]`;
  const payload = context === undefined ? undefined : redact(context);

  if (level === 'error') console.error(prefix, message, payload ?? '');
  else if (level === 'warn') console.warn(prefix, message, payload ?? '');
  else console.log(prefix, message, payload ?? '');
}

export interface Logger {
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, context) => emit('debug', scope, message, context),
    info: (message, context) => emit('info', scope, message, context),
    warn: (message, context) => emit('warn', scope, message, context),
    error: (message, context) => emit('error', scope, message, context),
  };
}

/**
 * Turns an unknown throwable into a string safe to persist in a sync-queue
 * entry or a SyncReport, both of which are surfaced in diagnostics UI.
 */
export function redactedMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
