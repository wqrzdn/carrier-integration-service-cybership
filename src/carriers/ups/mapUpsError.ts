import { HttpError } from '../../http/HttpError';
import { CarrierError } from '../../domain/errors/CarrierError';
import { ZodError } from 'zod';

/*
 * This is the "Brain" of our error handling. It takes any messy error-whether 
 * it's a 401 from UPS, a timeout, or a validation failure-and translates it 
 * into our standard CarrierError. The key here is the 'retryable' flag; it 
 * tells the rest of the system if it's worth trying the request again 
 * (like for a rate limit) or if we should just give up and fix the data.
 */
export function mapUpsError(err: unknown): CarrierError {
  if (err instanceof CarrierError) return err;

  if (err instanceof HttpError) {
    if (err.status === 401) {
      return new CarrierError('AUTH_FAILED', 'UPS', true, 'UPS returned 401 - auth token may have been invalidated', err);
    }
    
    if (err.status === 429) {
      return new CarrierError('RATE_LIMITED', 'UPS', true, 'UPS rate limit exceeded - back off before retrying', err);
    }
    
    // 502/503/504 indicate service unavailability (different from 500 internal error)
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      return new CarrierError('UPSTREAM_UNAVAILABLE', 'UPS', true, `UPS service temporarily unavailable (HTTP ${err.status})`, err);
    }
    
    if (err.status >= 500) {
      return new CarrierError('UPSTREAM_ERROR', 'UPS', true, `UPS server error (HTTP ${err.status})`, err);
    }
    
    return new CarrierError('INVALID_REQUEST', 'UPS', false, `UPS rejected the request (HTTP ${err.status})`, err);
  }

  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    // Check for common network error patterns
    if (message.includes('etimedout') || message.includes('econnreset') || message.includes('econnrefused') || message.includes('network error')) {
      return new CarrierError('NETWORK_ERROR', 'UPS', true, `Network error: ${err.message}`, err);
    }

    if (err instanceof ZodError) {
      return new CarrierError('INVALID_RESPONSE', 'UPS', false, 'UPS response validation failed', err);
    }

    return new CarrierError('INVALID_RESPONSE', 'UPS', false, `UPS response was malformed: ${err.message}`, err);
  }

  return new CarrierError('UNKNOWN_ERROR', 'UPS', false, 'An unexpected error occurred', err);
}