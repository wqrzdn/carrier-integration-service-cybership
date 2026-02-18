import { z } from 'zod';

/*
 * These are our "Safety Nets" for the UPS API responses. I’m using Zod to strictly 
 * define what the UPS JSON should look like. If UPS ever changes a field name 
 * or starts sending strings where we expect numbers, these schemas will catch 
 * it immediately. This prevents our app from crashing with "Cannot read property 
 * of undefined" errors deep in the logic.
 */

export const UpsAuthResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
});

const UpsRatedShipmentSchema = z.object({
  Service: z.object({
    Code: z.string(),
    Description: z.string(),
  }),
  TotalCharges: z.object({
    MonetaryValue: z.string(),
    CurrencyCode: z.string(),
  }),
  GuaranteedDelivery: z.object({
    BusinessDaysInTransit: z.string().optional(),
  }).optional(),
});

export const UpsRateResponseSchema = z.object({
  RateResponse: z.object({
    RatedShipment: z.array(UpsRatedShipmentSchema),
  }),
});

export type UpsAuthResponse = z.infer<typeof UpsAuthResponseSchema>;
export type UpsRateResponse = z.infer<typeof UpsRateResponseSchema>;