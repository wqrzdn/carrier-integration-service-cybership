import { UpsRateResponse } from './ups.schemas';
import { RateQuote } from '../../domain/models/RateQuote';

/*
 *  I noticed a specific UPS API quirk: 
 * if there's only one rate, they sometimes return an object instead of 
 * an array. I've added a normalization step here so the rest of  app 
 * always receives a consistent list, regardless of how many rates come 
 * back.
 */
export function mapUpsRateResponse(response: UpsRateResponse): RateQuote[] {
  // Normalize single object to array to ensure .map() never fails
  const shipments = Array.isArray(response.RateResponse.RatedShipment)
    ? response.RateResponse.RatedShipment
    : [response.RateResponse.RatedShipment];

  return shipments.map((shipment) => {
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