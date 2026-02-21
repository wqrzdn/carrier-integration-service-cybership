export interface RateQuote {
  /* * * this is the final result we show the user. i normalized everything so that 
   * whether the price comes from ups or fedex the format is identical. 
   * i also made deliverydays optional because some budget services 
   * do not give a guaranteed date.
   */
  carrier: string;
  serviceCode: string;
  serviceName: string;
  amount: number;
  currency: string;
  deliveryDays?: number;
}