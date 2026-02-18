export interface RateQuote {
  /* *
   * This is the final result we show the user. I’ve normalized everything so that 
   * whether the price comes from UPS or FedEx, the format is identical. 
   * I also made 'deliveryDays' optional because some budget services 
   * don't give a guaranteed date.
   */
  carrier: string;
  serviceCode: string;
  serviceName: string;
  amount: number;
  currency: string;
  deliveryDays?: number;
}