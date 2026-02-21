import { Carrier } from '../domain/interfaces/Carrier';
import { RateRequest } from '../domain/models/RateRequest';
import { RateQuote } from '../domain/models/RateQuote';
import { RateRequestSchema } from '../domain/validation/schemas';
import { LRUCache } from 'lru-cache';
import { logger } from '../utils/logger';

/*
 * this is the main brain of our app. it manages all carriers at once. 
 * i added an lru cache so we do not keep hitting apis for the same 
 * address over and over. also used promise allsettled so that even 
 * if one carrier like fedex is down ups can still show prices. 
 * it is built to be fast and never let one failure block the whole page.
 */

interface CachedRates {
  quotes: RateQuote[];
  expiresAt: number;
}

export class RateService {
  private readonly rateCache: LRUCache<string, CachedRates>;
  private readonly cacheTtlMs: number;

  constructor(
    private readonly carriers: Carrier[],
    cacheTtlMs: number = 30000,
    cacheMaxSize: number = 1000
  ) {
    this.cacheTtlMs = cacheTtlMs;
    this.rateCache = new LRUCache<string, CachedRates>({
      max: cacheMaxSize,
      ttl: cacheTtlMs,
      updateAgeOnGet: true,
    });
  }

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    // 1. validate input first
    RateRequestSchema.parse(request);

    // 2. check the cache to save time
    const cacheKey = this.generateCacheKey(request);
    const cached = this.rateCache.get(cacheKey);
    
    if (cached) {
      logger.debug('rate cache hit', {
        component: 'RateService',
        quoteCount: cached.quotes.length,
      });
      return cached.quotes;
    }

    // 3. fetch from all carriers at the same time
    const results = await Promise.allSettled(
      this.carriers.map((carrier) => carrier.getRates(request))
    );

    const quotes: RateQuote[] = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        quotes.push(...result.value);
      } else {
        logger.error('carrier fetch failed', {
          component: 'RateService',
          error: result.reason instanceof Error ? result.reason.message : 'unknown error',
        });
      }
    }

    // 4. save results for later
    this.rateCache.set(cacheKey, {
      quotes,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return quotes;
  }

  /*
   * simple helper to create a unique key for the cache.
   * it combines zip codes and package details so we 
   * only return cached rates for the exact same trip.
   */
  private generateCacheKey(request: RateRequest): string {
    const { origin, destination, packages, serviceLevel } = request;
    const totalWeight = packages.reduce((sum, p) => sum + p.weight, 0);
    const dimensionsKey = packages
      .map(p => `${p.dimensions.length}x${p.dimensions.width}x${p.dimensions.height}`)
      .sort()
      .join('|');
    
    return [
      `${origin.postalCode}-${origin.countryCode}`,
      `${destination.postalCode}-${destination.countryCode}`,
      totalWeight.toFixed(1),
      dimensionsKey,
      serviceLevel || 'ALL',
    ].join(':');
  }

  clearCache(): void {
    this.rateCache.clear();
  }
}