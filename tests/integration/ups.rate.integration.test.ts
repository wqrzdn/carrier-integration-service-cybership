import { RateService } from '../../src/service/RateService';
import { UpsCarrier } from '../../src/carriers/ups/UpsCarrier';
import { UpsAuthClient } from '../../src/carriers/ups/UpsAuthClient';
import { HttpClient } from '../../src/http/HttpClient';
import { RateRequest } from '../../src/domain/models/RateRequest';
import { ServiceLevel } from '../../src/domain/models/ServiceLevel';

import successFixture from '../fixtures/ups.rate.success.json';
import authFixture from '../fixtures/ups.auth.success.json';

/*
 * these tests are validating end to end ups rate shopping behaviour.
 * we are checking quote normalization, payload construction, service level
 * mapping, package transformation and input validation short circuiting.
 * this ensures our rate service correctly builds requests, interprets
 * responses and prevents invalid calls from reaching external systems.
 */

function makeHttpStub(overrides?: Partial<HttpClient>): jest.Mocked<HttpClient> {
  return {
    post: jest.fn(),
    postForm: jest.fn(),
    ...overrides,
  } as jest.Mocked<HttpClient>;
}

// disable retries in tests for instant execution
const TEST_RETRY_OPTIONS = { maxAttempts: 1, initialDelayMs: 0 };

const validRequest: RateRequest = {
  origin: {
    street1: '400 Perimeter Center Terrace',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30346',
    countryCode: 'US',
  },
  destination: {
    street1: '1600 Amphitheatre Pkwy',
    city: 'Mountain View',
    state: 'CA',
    postalCode: '94043',
    countryCode: 'US',
  },
  packages: [
    { weight: 5, dimensions: { length: 10, width: 8, height: 6 } },
  ],
};

describe('UPS Rate Shopping', () => {
  it('normalizes rated shipments into RateQuote objects', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);
    http.post.mockResolvedValueOnce(successFixture);

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);
    const service = new RateService([carrier]);

    const quotes = await service.getRates(validRequest);

    expect(quotes).toHaveLength(3);
    expect(quotes.find((q) => q.serviceCode === '03')).toMatchObject({
      carrier: 'UPS',
      serviceName: 'UPS Ground',
      amount: 12.34,
      deliveryDays: 3,
    });
  });

  it('builds the correct UPS request payload structure', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);
    http.post.mockResolvedValueOnce(successFixture);

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);
    const service = new RateService([carrier]);

    await service.getRates(validRequest);

    const [, body] = http.post.mock.calls[0] as [string, any, any];

    expect(body.RateRequest.Shipment.Shipper.Address.PostalCode).toBe('30346');
    expect(body.RateRequest.Request.RequestOption).toBe('Shop');
  });

  it('includes Service element when serviceLevel is specified', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);
    http.post.mockResolvedValueOnce(successFixture);

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);
    const service = new RateService([carrier]);

    await service.getRates({ ...validRequest, serviceLevel: ServiceLevel.GROUND });

    const [, body] = http.post.mock.calls[0] as [string, any, any];

    expect(body.RateRequest.Shipment.Service.Code).toBe('03');
    expect(body.RateRequest.Request.RequestOption).toBe('Rate');
  });

  it('maps package dimensions and weight correctly', async () => {
    const http = makeHttpStub();
    http.postForm.mockResolvedValueOnce(authFixture);
    http.post.mockResolvedValueOnce(successFixture);

    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);
    const service = new RateService([carrier]);

    await service.getRates(validRequest);

    const [, body] = http.post.mock.calls[0] as [string, any, any];
    const pkg = body.RateRequest.Shipment.Package[0];

    expect(pkg.PackageWeight.Weight).toBe('5');
    expect(pkg.Dimensions.Length).toBe('10');
  });

  it('short-circuits and throws before HTTP calls on invalid requests', async () => {
    const http = makeHttpStub();
    const authClient = new UpsAuthClient(http, 'id', 'secret');
    const carrier = new UpsCarrier(authClient, http);
    const service = new RateService([carrier]);

    const badRequest = { ...validRequest, packages: [] };

    await expect(service.getRates(badRequest as any)).rejects.toThrow();
    expect(http.postForm).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });
});