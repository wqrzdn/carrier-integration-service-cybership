import Bottleneck from 'bottleneck';
import { Carrier } from '../domain/interfaces/Carrier';
import { RateRequest } from '../domain/models/RateRequest';
import { RateQuote } from '../domain/models/RateQuote';
import { logger } from '../utils/logger';

/*
 * this is the traffic police for our service. i used the bottleneck library 
 * to make sure we do not hit ups or fedex too hard and get blocked. 
 * it queues up requests during busy times so we stay within the carrier 
 * limits. very important for production so we do not get blacklisted 
 * for a thundering herd spike.
 */
export class RateLimitedCarrierWrapper implements Carrier {
  private readonly limiter: Bottleneck;

  constructor(
    private readonly innerCarrier: Carrier,
    options?: {
      maxConcurrent?: number;
      minTime?: number;
      reservoir?: number;
      reservoirRefreshAmount?: number;
      reservoirRefreshInterval?: number;
    }
  ) {
    this.limiter = new Bottleneck({
      maxConcurrent: options?.maxConcurrent ?? 10,
      minTime: options?.minTime ?? 100, // default is 10 req per sec
      reservoir: options?.reservoir,
      reservoirRefreshAmount: options?.reservoirRefreshAmount,
      reservoirRefreshInterval: options?.reservoirRefreshInterval,
    });

    this.limiter.on('depleted', () => {
      logger.warn('rate limiter depleted', {
        component: 'RateLimitedCarrierWrapper',
        queued: this.limiter.counts().QUEUED,
      });
    });
  }

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    return this.limiter.schedule(() => {
      logger.debug('rate limiter scheduled request', {
        component: 'RateLimitedCarrierWrapper',
        queued: this.limiter.counts().QUEUED,
        running: this.limiter.counts().RUNNING,
      });
      return this.innerCarrier.getRates(request);
    });
  }
}