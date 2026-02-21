import { UpsCarrier } from '../../src/carriers/ups/UpsCarrier';
import { UpsAuthClient } from '../../src/carriers/ups/UpsAuthClient';
import { RateService } from '../../src/service/RateService';
import { CircuitBreaker } from '../../src/utils/circuitBreaker';
import { ResilientCarrierWrapper } from '../../src/service/ResilientCarrierWrapper';
import { HttpError } from '../../src/http/HttpError';
import type { RateRequest } from '../../src/domain/models/RateRequest';
import type { HttpClient } from '../../src/http/HttpClient';

/*
 * these tests are validating our production grade improvements.
 * we are checking retry with exponential backoff, proper circuit breaker
 * isolation and in memory caching with ttl. this ensures that even if ups
 * api fails or behaves unexpectedly, our system remains stable, efficient
 * and fault tolerant. with this suite in place we can confidently say our
 * resilience layer is working exactly as intended.
 */

describe('Phase 2: Retry Logic', () => {
  let mockHttp: jest.Mocked<HttpClient>;
  let authClient: UpsAuthClient;

  const mockRateRequest: RateRequest = {
    origin: {
      street1: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      countryCode: 'US',
    },
    destination: {
      street1: '456 Oak Ave',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      countryCode: 'US',
    },
    packages: [
      {
        weight: 10,
        dimensions: { length: 10, width: 10, height: 10 },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should retry on 429 rate limit errors', async () => {
    let callCount = 0;
    mockHttp = {
      post: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new HttpError(429, { response: { errors: [{ message: 'Rate limit exceeded' }] } });
        }
        return {
          RateResponse: {
            Response: {
              ResponseStatus: { Code: '1', Description: 'Success' },
            },
            RatedShipment: [
              {
                Service: { Code: '03', Description: 'UPS Ground' },
                TotalCharges: { MonetaryValue: '25.00', CurrencyCode: 'USD' },
                GuaranteedDelivery: { BusinessDaysInTransit: '3' },
              },
            ],
          },
        };
      }),
      postForm: jest.fn(),
    } as jest.Mocked<HttpClient>;

    authClient = new UpsAuthClient(
      mockHttp,
      'test-client',
      'test-secret'
    );

    jest.spyOn(authClient, 'getToken').mockResolvedValue('test-token');

    const upsCarrier = new UpsCarrier(authClient, mockHttp);
    const carrier = new ResilientCarrierWrapper(upsCarrier, {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
      },
    });

    const result = await carrier.getRates(mockRateRequest);

    expect(callCount).toBe(3);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(25);
  });

  it('should NOT retry on validation errors (400)', async () => {
    let callCount = 0;
    mockHttp = {
      post: jest.fn().mockImplementation(async () => {
        callCount++;
        throw new HttpError(400, { response: { errors: [{ message: 'Invalid postal code' }] } });
      }),
      postForm: jest.fn(),
    } as jest.Mocked<HttpClient>;

    authClient = new UpsAuthClient(
      mockHttp,
      'test-client',
      'test-secret'
    );

    jest.spyOn(authClient, 'getToken').mockResolvedValue('test-token');

    const upsCarrier = new UpsCarrier(authClient, mockHttp);
    const carrier = new ResilientCarrierWrapper(upsCarrier, {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
      },
    });

    await expect(carrier.getRates(mockRateRequest)).rejects.toThrow();
    expect(callCount).toBe(1);
  });
});

describe('Phase 2: Circuit Breaker', () => {
  let mockHttp: jest.Mocked<HttpClient>;
  let authClient: UpsAuthClient;
  let circuitBreaker: CircuitBreaker;

  const mockRateRequest: RateRequest = {
    origin: {
      street1: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      countryCode: 'US',
    },
    destination: {
      street1: '456 Oak Ave',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      countryCode: 'US',
    },
    packages: [
      {
        weight: 10,
        dimensions: { length: 10, width: 10, height: 10 },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    circuitBreaker = new CircuitBreaker('UPS-Test', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
    });
  });

  it('should open circuit after repeated failures', async () => {
    mockHttp = {
      post: jest.fn().mockRejectedValue(new Error('Service unavailable')),
      postForm: jest.fn(),
    } as jest.Mocked<HttpClient>;

    authClient = new UpsAuthClient(
      mockHttp,
      'test-client',
      'test-secret'
    );

    jest.spyOn(authClient, 'getToken').mockResolvedValue('test-token');

    const upsCarrier = new UpsCarrier(authClient, mockHttp);
    const carrier = new ResilientCarrierWrapper(upsCarrier, {
      retry: {
        maxAttempts: 1,
        initialDelayMs: 0,
      },
      circuitBreaker,
    });

    for (let i = 0; i < 3; i++) {
      await expect(carrier.getRates(mockRateRequest)).rejects.toThrow();
    }

    expect(circuitBreaker.getState()).toBe('OPEN');
    await expect(carrier.getRates(mockRateRequest)).rejects.toThrow(/circuit is open/i);
  });

  it('should transition to HALF_OPEN after timeout', async () => {
    mockHttp = {
      post: jest.fn().mockRejectedValue(new Error('Service unavailable')),
      postForm: jest.fn(),
    } as jest.Mocked<HttpClient>;

    authClient = new UpsAuthClient(
      mockHttp,
      'test-client',
      'test-secret'
    );

    jest.spyOn(authClient, 'getToken').mockResolvedValue('test-token');

    const upsCarrier = new UpsCarrier(authClient, mockHttp);
    const carrier = new ResilientCarrierWrapper(upsCarrier, {
      retry: {
        maxAttempts: 1,
        initialDelayMs: 0,
      },
      circuitBreaker,
    });

    for (let i = 0; i < 3; i++) {
      await expect(carrier.getRates(mockRateRequest)).rejects.toThrow();
    }

    expect(circuitBreaker.getState()).toBe('OPEN');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(circuitBreaker.getState()).toBe('HALF_OPEN');
  });

  it('should close circuit after successful requests in HALF_OPEN', async () => {
    let callCount = 0;
    mockHttp = {
      post: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) {
          throw new Error('Service unavailable');
        }
        return {
          RateResponse: {
            Response: {
              ResponseStatus: { Code: '1', Description: 'Success' },
            },
            RatedShipment: [
              {
                Service: { Code: '03', Description: 'UPS Ground' },
                TotalCharges: { MonetaryValue: '25.00', CurrencyCode: 'USD' },
                GuaranteedDelivery: { BusinessDaysInTransit: '3' },
              },
            ],
          },
        };
      }),
      postForm: jest.fn(),
    } as jest.Mocked<HttpClient>;

    authClient = new UpsAuthClient(
      mockHttp,
      'test-client',
      'test-secret'
    );

    jest.spyOn(authClient, 'getToken').mockResolvedValue('test-token');

    const upsCarrier = new UpsCarrier(authClient, mockHttp);
    const carrier = new ResilientCarrierWrapper(upsCarrier, {
      retry: {
        maxAttempts: 1,
        initialDelayMs: 0,
      },
      circuitBreaker,
    });

    for (let i = 0; i < 3; i++) {
      await expect(carrier.getRates(mockRateRequest)).rejects.toThrow();
    }

    expect(circuitBreaker.getState()).toBe('OPEN');
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await carrier.getRates(mockRateRequest);
    await carrier.getRates(mockRateRequest);

    expect(circuitBreaker.getState()).toBe('CLOSED');
  });
});

describe('Phase 2: Rate Caching', () => {
  let mockCarrier: any;
  let rateService: RateService;

  const mockRateRequest: RateRequest = {
    origin: {
      street1: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      countryCode: 'US',
    },
    destination: {
      street1: '456 Oak Ave',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      countryCode: 'US',
    },
    packages: [
      {
        weight: 10,
        dimensions: { length: 10, width: 10, height: 10 },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCarrier = {
      getRates: jest.fn().mockResolvedValue([
        {
          carrier: 'UPS',
          serviceCode: '03',
          serviceName: 'Ground',
          amount: 25.0,
          currency: 'USD',
          deliveryDays: 3,
        },
      ]),
    };
    rateService = new RateService([mockCarrier], 100);
  });

  it('should cache rate results', async () => {
    await rateService.getRates(mockRateRequest);
    await rateService.getRates(mockRateRequest);

    expect(mockCarrier.getRates).toHaveBeenCalledTimes(1);
  });

  it('should expire cache after TTL', async () => {
    await rateService.getRates(mockRateRequest);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await rateService.getRates(mockRateRequest);

    expect(mockCarrier.getRates).toHaveBeenCalledTimes(2);
  });

  it('should use different cache keys for different requests', async () => {
    await rateService.getRates(mockRateRequest);

    const differentRequest: RateRequest = {
      ...mockRateRequest,
      destination: {
        street1: '456 Oak Ave',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        countryCode: 'US',
      },
    };

    await rateService.getRates(differentRequest);

    expect(mockCarrier.getRates).toHaveBeenCalledTimes(2);
  });

  it('should clear cache when requested', async () => {
    await rateService.getRates(mockRateRequest);

    rateService.clearCache();

    await rateService.getRates(mockRateRequest);

    expect(mockCarrier.getRates).toHaveBeenCalledTimes(2);
  });
});