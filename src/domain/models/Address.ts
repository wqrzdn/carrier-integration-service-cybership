export interface Address {
  /* * standard address model for the whole app. i kept the field names generic 
   * like state and postalcode so they work for both us zip codes and 
   * international provinces without needing carrier specific models.
   */
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
}