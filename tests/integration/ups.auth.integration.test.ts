import { UpsAuthClient } from '../../src/carriers/ups/UpsAuthClient';
import { HttpClient } from '../../src/http/HttpClient';
import { HttpError } from '../../src/http/HttpError';
import authFixture from '../fixtures/ups.auth.success.json';

/*
 * these tests are validating the full token lifecycle for ups auth client.
 * we are checking first time acquisition, caching behaviour, cache clearing,
 * concurrency control, auth failure handling and expiry refresh logic.
 * this ensures our oauth handling is efficient, safe from race conditions
 * and resilient against authentication failures in production.
 */

function makeHttpStub(): jest.Mocked<HttpClient> {
  return {
    post: jest.fn(),
    postForm: jest.fn(),
  } as jest.Mocked<HttpClient>;
}

describe('UpsAuthClient - token lifecycle', () => {
  it('acquires a token on the first call', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);

    const client = new UpsAuthClient(http, 'client-id', 'client-secret');
    const token = await client.getToken();

    expect(token).toBe('test_access_token_abc123');
    expect(http.postForm).toHaveBeenCalledTimes(1);
    expect(http.postForm).toHaveBeenCalledWith(
      '/security/v1/oauth/token',
      { grant_type: 'client_credentials' },
      expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) })
    );
  });

  it('reuses a cached token on subsequent calls', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValue(authFixture);

    const client = new UpsAuthClient(http, 'client-id', 'client-secret');

    const first = await client.getToken();
    const second = await client.getToken();
    const third = await client.getToken();

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(http.postForm).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token after the cache is cleared', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValue(authFixture);

    const client = new UpsAuthClient(http, 'client-id', 'client-secret');

    await client.getToken();
    client.clearCache();
    await client.getToken();

    expect(http.postForm).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent token requests into a single fetch', async () => {
    const http = makeHttpStub();
    http.postForm.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(authFixture), 10))
    );

    const client = new UpsAuthClient(http, 'client-id', 'client-secret');

    const [t1, t2, t3, t4, t5] = await Promise.all([
      client.getToken(),
      client.getToken(),
      client.getToken(),
      client.getToken(),
      client.getToken(),
    ]);

    expect(t1).toBe('test_access_token_abc123');
    expect(new Set([t1, t2, t3, t4, t5]).size).toBe(1);
    expect(http.postForm).toHaveBeenCalledTimes(1);
  });

  it('throws AUTH_FAILED when the server returns 401', async () => {
    const http = makeHttpStub();
    http.postForm.mockRejectedValueOnce(new HttpError(401, null));

    const client = new UpsAuthClient(http, 'bad-id', 'bad-secret');

    await expect(client.getToken()).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      carrier: 'UPS',
      retryable: true,
    });
  });

  it('uses Basic auth with base64-encoded credentials', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);

    const client = new UpsAuthClient(http, 'myid', 'mysecret');
    await client.getToken();

    const expectedB64 = Buffer.from('myid:mysecret').toString('base64');
    expect(http.postForm).toHaveBeenCalledWith(
      '/security/v1/oauth/token',
      { grant_type: 'client_credentials' },
      { Authorization: `Basic ${expectedB64}` }
    );
  });

  it('single-flights concurrent token requests (thundering herd protection)', async () => {
    const http = makeHttpStub();

    http.postForm.mockResolvedValueOnce({
      access_token: 'test-token-concurrent',
      expires_in: 3600,
    });

    const authClient = new UpsAuthClient(http, 'id', 'secret', 60);

    const promises = Array.from({ length: 10 }, () => authClient.getToken());
    const tokens = await Promise.all(promises);

    expect(tokens).toHaveLength(10);
    tokens.forEach(token => expect(token).toBe('test-token-concurrent'));

    expect(http.postForm).toHaveBeenCalledTimes(1);
  });

  it('allows new token fetch after previous completes', async () => {
    const http = makeHttpStub();
    http.postForm
      .mockResolvedValueOnce({ access_token: 'token-1', expires_in: 1 })
      .mockResolvedValueOnce({ access_token: 'token-2', expires_in: 3600 });

    const authClient = new UpsAuthClient(http, 'id', 'secret', 0);

    const token1 = await authClient.getToken();
    expect(token1).toBe('token-1');

    await new Promise(resolve => setTimeout(resolve, 1100));

    const token2 = await authClient.getToken();
    expect(token2).toBe('token-2');

    expect(http.postForm).toHaveBeenCalledTimes(2);
  });
});