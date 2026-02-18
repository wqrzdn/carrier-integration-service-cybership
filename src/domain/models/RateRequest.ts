import { Address } from './Address';
import { Package } from './Package';
import { ServiceLevel } from './ServiceLevel';

/*
 * This is the main input for our service. It’s designed to be "carrier-blind," 
 * meaning it doesn't care if you're using UPS or FedEx. It just asks for the 
 * basics: from where, to where, what’s in the boxes, and how fast you want it. 
 * I’ve set it up to handle multiple packages at once, which is a big requirement 
 * for most shipping platforms.
 */
export interface RateRequest {
  origin: Address;
  destination: Address;
  packages: Package[];
  serviceLevel?: ServiceLevel;
}