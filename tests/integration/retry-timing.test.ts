import { UpsCarrier } from '../../src/carriers/ups/UpsCarrier';
import { UpsAuthClient } from '../../src/carriers/ups/UpsAuthClient';
import { ResilientCarrierWrapper } from '../../src/service/ResilientCarrierWrapper';
import { HttpClient } from '../../src/http/HttpClient';
import { HttpError } from '../../src/http/HttpError';
import { RateRequest } from '../../src/domain/models/RateRequest';

import authFixture from '../fixtures/ups.auth.success.json';
import successFixture from '../fixtures/ups.rate.success.json';

/*
 * these tests are validating retry timing accuracy and behaviour under failure.
 * we are checking exponential backoff calculation, jitter tolerance, max attempt
 * limits and max delay caps. this ensures our retry mechanism is not aggressive,
 * not infinite and behaves exactly as designed during rate limits and service
 * outages. with this suite we can confidently say our retry strategy is safe,
 * controlled and production ready.
 */

function makeHttpStub(overrides?: Partial<HttpClient>): jest.Mocked<HttpClient> {
  return {
    post: jest.fn(),
    postForm: jest.fn(),
    ...overrides,
  } as jest.Mocked<HttpClient>;
}

const validRequest: RateRequest = {
  origin: {
    street1: '400 Perimeter Center Terrace',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30346',
    countryCode: 'US',
  },
  destination: {
    street1: '1600 Amphitheatre Pkwy',
    city: 'Mountain View',
    state: 'CA',
    postalCode: '94043',
    countryCode: 'US',
  },
  packages: [
    { weight: 5, dimensions: { length: 10, width: 8, height: 6 } },
  ],
};

describe('Retry Logic - Timing & Behavior', () => {
  it('retries with exponential backoff on 429 rate limit', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);

    http.post
      .mockRejectedValueOnce(new HttpError(429, 'Rate limited'))
      .mockRejectedValueOnce(new HttpError(429, 'Rate limited'))
      .mockResolvedValueOnce(successFixture);

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const upsCarrier = new UpsCarrier(authClient, http);
    const carrier = new ResilientCarrierWrapper(upsCarrier, {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 500,
      },
    });

    const startTime = Date.now();
    const quotes = await carrier.getRates(validRequest);
    const duration = Date.now() - startTime;

    expect(duration).toBeGreaterThanOrEqual(225);
    expect(duration).toBeLessThan(600);

    expect(http.post).toHaveBeenCalledTimes(3);
    expect(quotes).toHaveLength(3);
  });

  it('does NOT retry on 400 bad request (non-retryable)', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);
    http.post.mockRejectedValueOnce(new HttpError(400, 'Bad request'));

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const upsCarrier = new UpsCarrier(authClient, http);
    const carrier = new ResilientCarrierWrapper(upsCarrier, {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 100,
      },
    });

    const startTime = Date.now();
    await expect(carrier.getRates(validRequest)).rejects.toThrow();
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(50);
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('respects maxAttempts limit', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);
    http.post.mockRejectedValue(new HttpError(503, 'Service unavailable'));

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const upsCarrier = new UpsCarrier(authClient, http);
    const carrier = new ResilientCarrierWrapper(upsCarrier, {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 500,
      },
    });

    const startTime = Date.now();
    await expect(carrier.getRates(validRequest)).rejects.toThrow();
    const duration = Date.now() - startTime;

    expect(duration).toBeGreaterThanOrEqual(225);
    expect(http.post).toHaveBeenCalledTimes(3);
  });

  it('caps backoff delay at maxDelayMs', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);
    http.post.mockRejectedValue(new HttpError(503, 'Service unavailable'));

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const upsCarrier = new UpsCarrier(authClient, http);
    const carrier = new ResilientCarrierWrapper(upsCarrier, {
      retry: {
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 200,
      },
    });

    const startTime = Date.now();
    await expect(carrier.getRates(validRequest)).rejects.toThrow();
    const duration = Date.now() - startTime;

    expect(duration).toBeGreaterThanOrEqual(525);
    expect(duration).toBeLessThan(1000);
    expect(http.post).toHaveBeenCalledTimes(5);
  });
});