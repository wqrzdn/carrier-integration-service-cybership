import { RateRequest } from '../models/RateRequest';
import { RateQuote } from '../models/RateQuote';

/*
 * this is the interface that all carriers like ups or fedex must follow. 
 * because of this the rest of the app does not care how each carrier api 
 * actually works. as long as a class has a getrates method it fits 
 * perfectly into our system.
 */
export interface Carrier {
  getRates(request: RateRequest): Promise<RateQuote[]>;
}