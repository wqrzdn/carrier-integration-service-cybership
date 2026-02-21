import { HttpClient } from '../../http/HttpClient';
import { HttpError } from '../../http/HttpError';
import { CarrierError, CarrierErrorCode } from '../../domain/errors/CarrierError';
import { withRetry } from '../../utils/retry';
import { logger } from '../../utils/logger';

/*
 * . 
 * I’ve added logging for observability and a more robust 'early refresh' 
 * strategy. By refreshing 120 seconds before the token actually dies, 
 * we eliminate the risk of a token expiring while a long-running shipping 
 * request is still in transit. It also includes automatic exponential 
 * backoff, so if UPS is having a brief outage, we don't just fail we wait 
 * and try again properly.
 */
export class UpsAuthClient {
  private token?: string;
  private expiresAt?: number;
  private inflightRefresh: Promise<string> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly tokenBufferSeconds: number = 120
  ) {}

  async getToken(): Promise<string> {
    if (this.token && this.expiresAt !== undefined) {
      const timeUntilExpiry = this.expiresAt - Date.now();
      const bufferMs = this.tokenBufferSeconds * 1000;
      
      if (timeUntilExpiry > bufferMs) {
        return this.token;
      }
      
      logger.info('OAuth token refresh triggered', {
        component: 'UpsAuthClient',
        reason: 'early_refresh',
      });
    }

    if (this.inflightRefresh) {
      logger.debug('Waiting for in-flight token refresh', {
        component: 'UpsAuthClient',
        singleFlighting: true,
      });
      return this.inflightRefresh;
    }

    this.inflightRefresh = this.fetchTokenWithRetry().finally(() => {
      this.inflightRefresh = null;
    });

    return this.inflightRefresh;
  }

  private async fetchTokenWithRetry(): Promise<string> {
    return withRetry(
      () => this.fetchToken(),
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: (error) => {
          if (error instanceof HttpError) {
            return error.status >= 500 || error.status === 429;
          }
          if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            return msg.includes('timeout') || msg.includes('network') || msg.includes('econnreset');
          }
          return false;
        },
      }
    );
  }

  clearCache(): void {
    this.token = undefined;
    this.expiresAt = undefined;
    logger.info('OAuth token cache cleared', { component: 'UpsAuthClient' });
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

      logger.info('OAuth token acquired successfully', {
        component: 'UpsAuthClient',
        expiresInSeconds: response.expires_in,
      });

      if (!this.token) {
        throw new CarrierError(CarrierErrorCode.AUTH_FAILED, 'UPS', false, 'Missing access_token');
      }

      return this.token;
    } catch (err) {
      const message = err instanceof HttpError 
        ? `UPS authentication failed (HTTP ${err.status})` 
        : 'UPS authentication request failed';

      logger.error('OAuth token acquisition failed', { component: 'UpsAuthClient', error: message });

      throw new CarrierError(CarrierErrorCode.AUTH_FAILED, 'UPS', true, message, err);
    }
  }
}