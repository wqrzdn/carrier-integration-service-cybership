import { Address } from './Address';
import { Package } from './Package';
import { ServiceLevel } from './ServiceLevel';

/*
 * this is the main input for our service. it is designed to be carrier blind 
 * meaning it does not care if you are using ups or fedex. it just asks for 
 * the basics: from where, to where, what is in the boxes, and how fast you 
 * want it. i set it up to handle multiple packages at once because most 
 * shipping platforms need that.
 */
export interface RateRequest {
  origin: Address;
  destination: Address;
  packages: Package[];
  serviceLevel?: ServiceLevel;
}