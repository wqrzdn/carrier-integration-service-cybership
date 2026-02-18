import { z } from 'zod';
import { ServiceLevel } from '../models/ServiceLevel';

/*
 * This file is our "Security Checkpoint." I’ve used Zod here to define schemas 
 * that validate incoming data before it even touches the API. It checks for 
 * basic things like making sure weights are positive and country codes are 
 * exactly two letters. It's much better to fail early with a clear error 
 * than to send bad data to UPS and get a cryptic 400 response back.
 */

export const AddressSchema = z.object({
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  postalCode: z.string().min(1),
  countryCode: z.string().length(2),
});

export const PackageSchema = z.object({
  weight: z.number().positive(),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
});

export const RateRequestSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSchema).min(1),
  serviceLevel: z.nativeEnum(ServiceLevel).optional(),
});