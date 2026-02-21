import { Carrier } from '../domain/interfaces/Carrier';
import { RateRequest } from '../domain/models/RateRequest';
import { RateQuote } from '../domain/models/RateQuote';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { withRetry, RetryOptions } from '../utils/retry';
import { CarrierError, CarrierErrorCode } from '../domain/errors/CarrierError';
import { logger } from '../utils/logger';

/*
 * this is the bodyguard for our shipping service. it uses the decorator 
 * pattern to wrap any carrier (ups, fedex, etc.) with extra protection. 
 * it handles the retry logic and circuit breaking so if a carrier api 
 * is down we do not keep hitting it and wasting resources. this keeps 
 * the actual carrier code clean and focused only on data mapping.
 */
export class ResilientCarrierWrapper implements Carrier {
  private readonly retryOptions: RetryOptions;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly innerCarrier: Carrier,
    options?: {
      circuitBreaker?: CircuitBreaker;
      retry?: Partial<RetryOptions>;
    }
  ) {
    this.circuitBreaker = options?.circuitBreaker ?? new CircuitBreaker('DEFAULT', {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
    });

    this.retryOptions = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 8000,
      backoffMultiplier: 2,
      ...options?.retry,
      shouldRetry: (error) => {
        if (error instanceof CarrierError) {
          return error.retryable && error.code !== CarrierErrorCode.AUTH_FAILED;
        }
        return false;
      },
    };
  }

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    const startTime = Date.now();
    const requestId = `rate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('rate request with resilience wrapper', {
      component: 'ResilientCarrierWrapper',
      requestId,
      circuitState: this.circuitBreaker.getState(),
    });

    try {
      return await this.circuitBreaker.execute(async () => {
        return await withRetry(
          () => this.innerCarrier.getRates(request),
          this.retryOptions
        );
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('resilient carrier request failed', {
        component: 'ResilientCarrierWrapper',
        requestId,
        error: error instanceof Error ? error.message : 'unknown error',
        duration,
      });
      throw error;
    }
  }
}