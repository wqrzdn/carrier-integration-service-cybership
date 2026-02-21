/*
 * enum based codes so error handling is same for all carriers.
 * this makes a contract where every code has a meaning.
 * makes everything predictable and easy to test.
 */
export enum CarrierErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  UPSTREAM_ERROR = 'UPSTREAM_ERROR',
  UPSTREAM_UNAVAILABLE = 'UPSTREAM_UNAVAILABLE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class CarrierError extends Error {
  /*
   * this is the smart error class. instead of just a message i added
   * a retryable flag and a specific code. now the frontend or middleware
   * knows exactly when to retry (like for rate limits) or when to stop
   * (like for bad input) without any guessing.
   */
  constructor(
    public readonly code: CarrierErrorCode | string,
    public readonly carrier: string,
    public readonly retryable: boolean,
    message: string,
    public readonly cause?: unknown,
    public readonly httpStatus?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CarrierError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CarrierError);
    }
  }
}