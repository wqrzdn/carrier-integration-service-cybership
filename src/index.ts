import { config } from './config';
import { AxiosHttpClient } from './http/AxiosHttpClient';
import { UpsAuthClient } from './carriers/ups/UpsAuthClient';
import { UpsCarrier } from './carriers/ups/UpsCarrier';
import { RateService } from './service/RateService';

const http = new AxiosHttpClient(config.ups.baseUrl, config.ups.timeoutMs);

const upsAuthClient = new UpsAuthClient(
  http, 
  config.ups.clientId, 
  config.ups.clientSecret,
  config.ups.tokenBufferSeconds
);

const upsCarrier = new UpsCarrier(upsAuthClient, http);

export const rateService = new RateService([upsCarrier]);

export type { RateRequest } from './domain/models/RateRequest';
export type { RateQuote } from './domain/models/RateQuote';
export type { Address } from './domain/models/Address';
export type { Package } from './domain/models/Package';
export { ServiceLevel } from './domain/models/ServiceLevel';
export { CarrierError } from './domain/errors/CarrierError';
/*
 * This is the main entry point where we wire everything together. We start by setting up a 
 * single Axios instance for the whole app to keep connection pooling efficient. Then we 
 * initialize the UPS auth manager and the carrier adapter, passing them into the main 
 * RateService. I've designed the service to take an array of carriers so that adding 
 * something like FedEx later is just a one-line change here.
 */