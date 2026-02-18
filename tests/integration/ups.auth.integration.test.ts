import { UpsAuthClient } from '../../src/carriers/ups/UpsAuthClient';
import { HttpClient } from '../../src/http/HttpClient';
import { HttpError } from '../../src/http/HttpError';
import authFixture from '../fixtures/ups.auth.success.json';

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
});