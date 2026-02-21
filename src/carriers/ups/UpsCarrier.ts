import { Carrier } from '../../domain/interfaces/Carrier';
import { RateRequest } from '../../domain/models/RateRequest';
import { RateQuote } from '../../domain/models/RateQuote';
import { HttpClient } from '../../http/HttpClient';
import { UpsAuthClient } from './UpsAuthClient';
import { buildUpsRateRequest } from './buildUpsRateRequest';
import { UpsRateResponseSchema } from './ups.schemas';
import { mapUpsRateResponse } from './UpsRateMapper';
import { mapUpsError } from './mapUpsError';
import { CarrierError, CarrierErrorCode } from '../../domain/errors/CarrierError';
import { logger } from '../../utils/logger';

/*
 *  
 * logging with unique Request IDs, which is a lifesaver for debugging in 
 * production. It tracks the exact duration of every call, so we can monitor 
 * UPS latency. While it handles the UPS-specific 401 retry, it stays focused 
 * on the API mapping, leaving the broader "big picture" resilience to the 
 * wrapper a perfect example of the Single Responsibility Principle.
 */
export class UpsCarrier implements Carrier {
  constructor(
    private readonly authClient: UpsAuthClient,
    private readonly http: HttpClient
  ) {}

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    const startTime = Date.now();
    const requestId = `rate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Fetching UPS rates', {
      component: 'UpsCarrier',
      requestId,
      origin: `${request.origin.city}, ${request.origin.state}`,
      destination: `${request.destination.city}, ${request.destination.state}`,
      packageCount: request.packages.length,
    });

    try {
      const quotes = await this.executeRateRequest(request, false);
      const duration = Date.now() - startTime;

      logger.info('UPS rates fetched successfully', {
        component: 'UpsCarrier',
        requestId,
        quoteCount: quotes.length,
        duration,
      });

      return quotes;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('UPS rate fetch failed', {
        component: 'UpsCarrier',
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      });
      throw error;
    }
  }

  private async executeRateRequest(request: RateRequest, isAuthRetry: boolean): Promise<RateQuote[]> {
    const token = await this.authClient.getToken();

    try {
      const rawResponse = await this.http.post(
        '/api/rating/v2205/Rate',
        buildUpsRateRequest(request),
        {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          transId: `rate-${Date.now()}`,
          transactionSrc: 'carrier-integration-service',
        }
      );

      const validated = UpsRateResponseSchema.parse(rawResponse);
      return mapUpsRateResponse(validated);
      
    } catch (err) {
      const carrierError = mapUpsError(err);

      if (carrierError.code === CarrierErrorCode.AUTH_FAILED && !isAuthRetry) {
        logger.warn('Auth token rejected, refreshing and retrying', {
          component: 'UpsCarrier',
          errorCode: carrierError.code,
        });
        this.authClient.clearCache();
        return this.executeRateRequest(request, true);
      }

      throw carrierError;
    }
  }
}