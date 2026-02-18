import { RateRequest } from '../models/RateRequest';
import { RateQuote } from '../models/RateQuote';

/*
 * This is the interface that all carriers like UPS, FedEx, or DHL must follow. 
 * By using this, the rest of the app doesn't have to worry about how each 
 * carrier’s API works. As long as a class has a 'getRates' method that takes 
 * a request and returns quotes, it fits right into our system.
 */
export interface Carrier {
  getRates(request: RateRequest): Promise<RateQuote[]>;
}