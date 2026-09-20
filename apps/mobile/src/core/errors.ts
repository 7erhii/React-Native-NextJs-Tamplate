/**
 * Typed errors shared across ports. Callers branch on `code`, never on message
 * text, so messages stay free to change and to carry redacted detail.
 */

export type AppErrorCode =
  | 'offline'
  | 'conflict'
  | 'not-supported'
  | 'configuration'
  | 'validation'
  | 'not-found'
  | 'throttled'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = new.target.name;
  }
}

/** The operation needs a network or backend that is not reachable. */
export class OfflineError extends AppError {
  constructor(message = 'No connection to the backend', options?: { cause?: unknown }) {
    super('offline', message, options);
  }
}

/** A concurrent write landed first. Carries both revisions so callers can retry. */
export class ConflictError extends AppError {
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(expectedRevision: number, actualRevision: number) {
    super(
      'conflict',
      `Write rejected: expected revision ${expectedRevision} but stored revision is ${actualRevision}`,
    );
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

/** The active adapter cannot do this. Thrown rather than silently ignored. */
export class NotSupportedError extends AppError {
  constructor(message: string) {
    super('not-supported', message);
  }
}

/**
 * The app is wired in a way that cannot work. Thrown at startup rather than at
 * first use, because a game that appears to save and does not is the worst
 * failure available here.
 */
export class ConfigurationError extends AppError {
  constructor(message: string) {
    super('configuration', message);
  }
}

/** Data crossing a trust boundary did not match its schema. */
export class ValidationError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('validation', message, options);
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function hasErrorCode(value: unknown, code: AppErrorCode): boolean {
  return isAppError(value) && value.code === code;
}
