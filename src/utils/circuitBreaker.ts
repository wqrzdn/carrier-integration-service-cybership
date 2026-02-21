import { logger } from './logger';

/*
 * this is the ultimate safeguard for our system. it prevents a single 
 * broken api from crashing our entire app. if ups is down it stops 
 * wastefully calling it and gives the carrier server time to recover. 
 * i built it with three states: closed (all good), open (stop calling), 
 * and half open (testing to see if it's back). it's a critical piece 
 * for any high scale system.
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number; 
  successThreshold: number; 
  timeout: number; 
}

export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5, 
  successThreshold: 2, 
  timeout: 60000, 
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttemptTime: number = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(
    private readonly name: string,
    options?: Partial<CircuitBreakerOptions>
  ) {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitBreakerOpenError(
          this.name,
          `circuit is open. try again at ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      
      logger.info('circuit transitioning to half open', {
        component: 'CircuitBreaker',
        name: this.name,
      });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN && Date.now() >= this.nextAttemptTime) {
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        
        logger.info('circuit breaker recovered', {
          component: 'CircuitBreaker',
          name: this.name,
          newState: CircuitState.CLOSED,
        });
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.options.failureThreshold
    ) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.timeout;
      
      logger.warn('circuit breaker opened', {
        component: 'CircuitBreaker',
        name: this.name,
        failureCount: this.failureCount,
        nextAttemptAt: new Date(this.nextAttemptTime).toISOString(),
      });
    }
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    message: string
  ) {
    super(message);
    this.name = 'CircuitBreakerOpenError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitBreakerOpenError);
    }
  }
}