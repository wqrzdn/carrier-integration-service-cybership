import { Carrier } from '../domain/interfaces/Carrier';
import { RateRequest } from '../domain/models/RateRequest';
import { RateQuote } from '../domain/models/RateQuote';
import { RateRequestSchema } from '../domain/validation/schemas';

/*
 * This service handles the heavy lifting of talking to multiple carriers at once. 
 * I’ve used Promise.allSettled here so that if one carrier (like UPS) is down, 
 * the whole request doesn't crash-we still show the user rates from the carriers 
 * that actually worked. It also validates the request upfront using Zod so we don't 
 * waste API calls on bad data.
 */

export class RateService {
  constructor(private readonly carriers: Carrier[]) {}

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    RateRequestSchema.parse(request);

    const results = await Promise.allSettled(
      this.carriers.map((carrier) => carrier.getRates(request))
    );

    const quotes: RateQuote[] = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        quotes.push(...result.value);
      } else {
        console.error('Carrier rate fetch failed:', result.reason);
      }
    }

    return quotes;
  }
}