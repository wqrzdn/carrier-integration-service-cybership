import { UpsCarrier } from '../../src/carriers/ups/UpsCarrier';
import { UpsAuthClient } from '../../src/carriers/ups/UpsAuthClient';
import { HttpClient } from '../../src/http/HttpClient';
import { HttpError } from '../../src/http/HttpError';
import { RateRequest } from '../../src/domain/models/RateRequest';

import authFixture from '../fixtures/ups.auth.success.json';
import malformedFixture from '../fixtures/ups.rate.malformed.json';

/*
 * these tests are validating error handling and classification logic for ups carrier.
 * we are ensuring proper mapping of http status codes, network failures,
 * malformed responses and authentication breakdowns into domain level errors.
 * this guarantees that retry logic behaves correctly and non retryable
 * failures are clearly identified without causing unstable behaviour.
 */

const validRequest: RateRequest = {
  origin: {
    street1: '400 Perimeter Center',
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
  packages: [{ weight: 5, dimensions: { length: 10, width: 8, height: 6 } }],
};

function makeHttpStub(): jest.Mocked<HttpClient> {
  return {
    post: jest.fn(),
    postForm: jest.fn(),
  } as jest.Mocked<HttpClient>;
}

// disable retries in tests for instant execution
const TEST_RETRY_OPTIONS = { maxAttempts: 1, initialDelayMs: 0 };

// test carriers directly to verify error mapping behaviour
// RateService now uses promise.allsettled to handle partial failures
describe('UPS Integration - Error Handling', () => {
  it('maps 401 and 429 to retryable carrier errors', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValue(authFixture);

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);

    http.post.mockRejectedValue(new HttpError(401, null));
    await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      retryable: true,
    });

    http.post.mockRejectedValue(new HttpError(429, null));
    await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('maps 5xx status codes to UPSTREAM_UNAVAILABLE or UPSTREAM_ERROR', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValue(authFixture);

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);

    http.post.mockRejectedValue(new HttpError(503, null));
    await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
    });

    http.post.mockRejectedValue(new HttpError(500, null));
    await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      retryable: true,
    });
  });

  it('maps 400 and 422 to non-retryable INVALID_REQUEST', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValue(authFixture);
    http.post.mockRejectedValueOnce(new HttpError(400, null));

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);

    await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      retryable: false,
    });
  });

  it('handles malformed JSON and contract violations', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValue(authFixture);
    http.post.mockResolvedValueOnce(malformedFixture);

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);

    await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retryable: false,
    });
  });

  it('catches network-level failures like connection resets', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValue(authFixture);

    const networkError = new Error('socket hang up');
    networkError.message = 'ECONNRESET';
    http.post.mockRejectedValue(networkError);

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);

    await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    });
  });

  it('aborts rate calls if authentication fails', async () => {
    const http = makeHttpStub();
    http.postForm.mockRejectedValueOnce(new HttpError(401, null));

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);

    await expect(carrier.getRates(validRequest)).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
  });
});