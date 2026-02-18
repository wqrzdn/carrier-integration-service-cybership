export interface Address {
  /* *
   * Standard address model for the whole app. I've kept the field names generic 
   * (like 'state' and 'postalCode') so they work for both US ZIP codes and 
   * international provinces without needing carrier-specific models.
   */
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
}