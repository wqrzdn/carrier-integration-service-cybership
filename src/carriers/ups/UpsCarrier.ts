import { Carrier } from '../../domain/interfaces/Carrier';
import { RateRequest } from '../../domain/models/RateRequest';
import { RateQuote } from '../../domain/models/RateQuote';
import { HttpClient } from '../../http/HttpClient';
import { UpsAuthClient } from './UpsAuthClient';
import { buildUpsRateRequest } from './buildUpsRateRequest';
import { UpsRateResponseSchema } from './ups.schemas';
import { mapUpsRateResponse } from './UpsRateMapper';
import { mapUpsError } from './mapUpsError';

/*
 * This is the "Grand Finale" class where everything we’ve built comes together. 
 * It implements the Carrier interface and handles the actual conversation 
 * with UPS. I’ve added a special "one-time retry" logic here; if UPS rejects 
 * our token mid-request, we don't just crash. Instead, we silently clear the 
 * cache, grab a fresh token, and try again-making the whole process much 
 * more resilient for the end user.
 */
export class UpsCarrier implements Carrier {
  constructor(
    private readonly authClient: UpsAuthClient,
    private readonly http: HttpClient
  ) {}

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    return this.executeRateRequest(request, false);
  }

  private async executeRateRequest(request: RateRequest, isRetry: boolean): Promise<RateQuote[]> {
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

      if (carrierError.code === 'AUTH_FAILED' && !isRetry) {
        this.authClient.clearCache();
        return this.executeRateRequest(request, true);
      }

      throw carrierError;
    }
  }
}