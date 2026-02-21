import { z } from 'zod';
import { ServiceLevel } from '../models/ServiceLevel';

/*
 * this file is our security checkpoint. i used zod here to define schemas 
 * that validate incoming data before it even touches the api. it checks 
 * basics like making sure weights are positive and country codes are 
 * exactly two letters. much better to fail early with a clear error 
 * than to send bad data to ups and get a cryptic 400 response back.
 */

// common iso 3166-1 alpha-2 country codes
const VALID_COUNTRY_CODES = ['US', 'CA', 'MX', 'GB', 'DE', 'FR', 'IT', 'ES', 'AU', 'NZ', 'JP', 'CN'] as const;

// us states and canadian provinces (2-letter codes)
const US_CA_STATE_REGEX = /^[A-Z]{2}$/;

export const AddressSchema = z.object({
  street1: z.string()
    .min(1, 'street address required')
    .max(35, 'street address too long')
    .refine((val) => val.trim().length > 0, {
      message: 'street address cannot be only whitespace',
    }),
  street2: z.string().max(35, 'street address too long').optional(),
  city: z.string()
    .min(1, 'city name required')
    .max(30, 'city name too long')
    .refine((val) => val.trim().length > 0, {
      message: 'city name cannot be only whitespace',
    }),
  state: z.string()
    .length(2, 'state must be 2-letter code')
    .regex(US_CA_STATE_REGEX, 'state must be uppercase 2-letter code'),
  postalCode: z.string().min(3).max(10, 'invalid postal code length'),
  countryCode: z.string()
    .length(2, 'country code must be 2 letters')
    .toUpperCase()
    .refine((code) => VALID_COUNTRY_CODES.includes(code as any), {
      message: 'invalid country code (must be iso 3166-1 alpha-2)',
    }),
});

export const PackageSchema = z.object({
  weight: z.number()
    .positive('weight must be positive')
    .max(150, 'weight exceeds maximum (150 lbs)')
    .refine((w) => w >= 0.1, 'weight must be at least 0.1 lbs'),
  dimensions: z.object({
    length: z.number()
      .positive('length must be positive')
      .max(108, 'length exceeds maximum (108 inches)'),
    width: z.number()
      .positive('width must be positive')
      .max(108, 'width exceeds maximum (108 inches)'),
    height: z.number()
      .positive('height must be positive')
      .max(108, 'height exceeds maximum (108 inches)'),
  }),
});

export const RateRequestSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSchema)
    .min(1, 'at least one package required')
    .max(200, 'maximum 200 packages per shipment'),
  serviceLevel: z.nativeEnum(ServiceLevel).optional(),
});

export type ValidatedAddress = z.infer<typeof AddressSchema>;
export type ValidatedPackage = z.infer<typeof PackageSchema>;
export type ValidatedRateRequest = z.infer<typeof RateRequestSchema>;