import { UpsRateResponse } from './ups.schemas';
import { RateQuote } from '../../domain/models/RateQuote';

/*
 * This is the final "Cleanup Crew." It takes that massive, deeply nested UPS 
 * response and filters out only the parts we care about. I’ve made sure to 
 * convert strings like "12.45" back into real numbers and handled the 
 * delivery days as an optional field so our frontend doesn't get cluttered 
 * with 'undefined' values.
 */
export function mapUpsRateResponse(response: UpsRateResponse): RateQuote[] {
  return response.RateResponse.RatedShipment.map((shipment) => {
    const deliveryDaysRaw = shipment.GuaranteedDelivery?.BusinessDaysInTransit;

    return {
      carrier: 'UPS',
      serviceCode: shipment.Service.Code,
      serviceName: shipment.Service.Description,
      amount: Number(shipment.TotalCharges.MonetaryValue),
      currency: shipment.TotalCharges.CurrencyCode,
      ...(deliveryDaysRaw !== undefined && {
        deliveryDays: Number(deliveryDaysRaw),
      }),
    };
  });
}