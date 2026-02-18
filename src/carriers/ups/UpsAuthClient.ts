import { HttpClient } from '../../http/HttpClient';
import { HttpError } from '../../http/HttpError';
import { CarrierError } from '../../domain/errors/CarrierError';

/*
 * This class handles the "Keys" to the UPS house. I’ve built it to be smart about 
 * performance; it caches the OAuth token so we don't ask UPS for a new one on 
 * every single request. I also added 'thundering herd' protection-if 10 requests 
 * come in at once while the token is expired, we only make one call to UPS, 
 * and all 10 requests wait for that same single token.
 */
export class UpsAuthClient {
  private token?: string;
  private expiresAt?: number;
  private inflightRefresh: Promise<string> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly tokenBufferSeconds: number = 60
  ) {}

  async getToken(): Promise<string> {
    if (this.token && this.expiresAt !== undefined && this.expiresAt > Date.now()) {
      return this.token;
    }

    if (this.inflightRefresh) {
      return this.inflightRefresh;
    }

    this.inflightRefresh = this.fetchToken().finally(() => {
      this.inflightRefresh = null;
    });

    return this.inflightRefresh;
  }

  clearCache(): void {
    this.token = undefined;
    this.expiresAt = undefined;
  }

  private async fetchToken(): Promise<string> {
    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await this.http.postForm<any>(
        '/security/v1/oauth/token',
        { grant_type: 'client_credentials' },
        { Authorization: `Basic ${credentials}` }
      );

      this.token = response.access_token;
      this.expiresAt = Date.now() + (response.expires_in - this.tokenBufferSeconds) * 1000;

      // Validate that UPS actually returned a token (API contract check)
      if (!this.token) {
        throw new CarrierError(
          'AUTH_FAILED',
          'UPS',
          false,
          'UPS authentication response missing access_token',
          undefined
        );
      }

      return this.token;
    } catch (err) {
      const message = err instanceof HttpError 
        ? `UPS authentication failed (HTTP ${err.status})` 
        : 'UPS authentication request failed';

      throw new CarrierError('AUTH_FAILED', 'UPS', true, message, err);
    }
  }
}