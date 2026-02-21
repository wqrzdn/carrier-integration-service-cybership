import { config } from './config';
import { AxiosHttpClient } from './http/AxiosHttpClient';
import { UpsAuthClient } from './carriers/ups/UpsAuthClient';
import { UpsCarrier } from './carriers/ups/UpsCarrier';
import { RateService } from './service/RateService';
import { ResilientCarrierWrapper } from './service/ResilientCarrierWrapper';
import { RateLimitedCarrierWrapper } from './service/RateLimitedCarrierWrapper';
import { CircuitBreaker } from './utils/circuitBreaker';
import { HealthChecker } from './health/HealthChecker';

/*
 * this is the composition root. i wired everything together here-the 
 * networking, the authentication, and the resilience wrappers. 
 * it follows the hexagonal architecture pattern, so adding a new carrier 
 * like fedex is as simple as creating the adapter and plugging it into 
 * the rateservice array without touching any other business logic.
 */

const http = new AxiosHttpClient(config.ups.baseUrl, config.ups.timeoutMs);

const upsAuthClient = new UpsAuthClient(
  http, 
  config.ups.clientId, 
  config.ups.clientSecret,
  config.ups.tokenBufferSeconds
);

// core ups carrier adapter
const upsCarrier = new UpsCarrier(upsAuthClient, http);

// rate limiting wrap
const rateLimitedUps = new RateLimitedCarrierWrapper(upsCarrier, {
  maxConcurrent: 10,
  minTime: 100,
});

// resilience wrap
const upsCircuitBreaker = new CircuitBreaker('UPS', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
});

const resilientUps = new ResilientCarrierWrapper(rateLimitedUps, {
  circuitBreaker: upsCircuitBreaker,
  retry: { maxAttempts: 3, initialDelayMs: 1000 },
});

// the main service exported for the rest of the app
export const rateService = new RateService([resilientUps]);

// health monitoring export
export const healthChecker = new HealthChecker(
  upsAuthClient,
  new Map([['UPS', upsCircuitBreaker]])
);