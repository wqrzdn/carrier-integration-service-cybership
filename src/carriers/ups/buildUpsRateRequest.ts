import { RateRequest } from '../../domain/models/RateRequest';
import { ServiceLevel } from '../../domain/models/ServiceLevel';
import { Address } from '../../domain/models/Address';

/*
 * This is the translator that turns our clean internal data into the messy JSON 
 * UPS expects. I've broken out the address logic into a helper and made sure 
 * to cast numbers like weight and dimensions to strings, because the UPS API 
 * will literally throw an error if you send them as actual numbers.
 */

const SERVICE_LEVEL_TO_UPS_CODE: Record<ServiceLevel, string> = {
  [ServiceLevel.OVERNIGHT]: '01',
  [ServiceLevel.EXPRESS]: '02',
  [ServiceLevel.GROUND]: '03',
};

function buildAddressLines(address: Address): string[] {
  const lines = [address.street1];
  if (address.street2) {
    lines.push(address.street2);
  }
  return lines;
}

export function buildUpsRateRequest(request: RateRequest): unknown {
  const shipment: Record<string, unknown> = {
    Shipper: {
      Name: 'Shipper',
      Address: {
        AddressLine: buildAddressLines(request.origin),
        City: request.origin.city,
        StateProvinceCode: request.origin.state,
        PostalCode: request.origin.postalCode,
        CountryCode: request.origin.countryCode,
      },
    },
    ShipTo: {
      Name: 'Recipient',
      Address: {
        AddressLine: buildAddressLines(request.destination),
        City: request.destination.city,
        StateProvinceCode: request.destination.state,
        PostalCode: request.destination.postalCode,
        CountryCode: request.destination.countryCode,
      },
    },
    ShipFrom: {
      Address: {
        PostalCode: request.origin.postalCode,
        CountryCode: request.origin.countryCode,
      },
    },
    Package: request.packages.map((pkg) => ({
      PackagingType: {
        Code: '02',
        Description: 'Package',
      }, 
      Dimensions: {
        UnitOfMeasurement: { Code: 'IN', Description: 'Inches' },
        Length: String(pkg.dimensions.length),
        Width: String(pkg.dimensions.width),
        Height: String(pkg.dimensions.height),
      },
      PackageWeight: {
        UnitOfMeasurement: { Code: 'LBS', Description: 'Pounds' },
        Weight: String(pkg.weight),
      },
    })),
  };

  if (request.serviceLevel !== undefined) {
    shipment['Service'] = {
      Code: SERVICE_LEVEL_TO_UPS_CODE[request.serviceLevel],
    };
  }

  return {
    RateRequest: {
      Request: {
        RequestOption: request.serviceLevel ? 'Rate' : 'Shop',
        TransactionReference: { CustomerContext: 'rate-request' },
      },
      Shipment: shipment,
    },
  };
}