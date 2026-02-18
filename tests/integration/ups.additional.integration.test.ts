    import { RateService } from '../../src/service/RateService';
    import { UpsCarrier } from '../../src/carriers/ups/UpsCarrier';
    import { UpsAuthClient } from '../../src/carriers/ups/UpsAuthClient';
    import { HttpClient } from '../../src/http/HttpClient';
    import { HttpError } from '../../src/http/HttpError';
    import { RateRequest } from '../../src/domain/models/RateRequest';
    import { ServiceLevel } from '../../src/domain/models/ServiceLevel';
    import { Carrier } from '../../src/domain/interfaces/Carrier';
    import { RateQuote } from '../../src/domain/models/RateQuote';

    import successFixture from '../fixtures/ups.rate.success.json';
    import authFixture from '../fixtures/ups.auth.success.json';

    function makeHttpStub(overrides?: Partial<HttpClient>): jest.Mocked<HttpClient> {
    return {
        post: jest.fn(),
        postForm: jest.fn(),
        ...overrides,
    } as jest.Mocked<HttpClient>;
    }

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

    describe('UPS Integration - Additional Coverage', () => {
    describe('Multi-package shipments', () => {
        it('handles multi-package shipments correctly', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValueOnce(authFixture);
        http.post.mockResolvedValueOnce(successFixture);

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const carrier = new UpsCarrier(authClient, http);
        const service = new RateService([carrier]);

        const requestWithMultiplePackages: RateRequest = {
            ...validRequest,
            packages: [
            { weight: 5, dimensions: { length: 10, width: 8, height: 6 } },
            { weight: 3, dimensions: { length: 5, width: 5, height: 5 } },
            ],
        };

        await service.getRates(requestWithMultiplePackages);

        const [, body] = http.post.mock.calls[0] as [string, any, any];
        expect(body.RateRequest.Shipment.Package).toHaveLength(2);
        expect(body.RateRequest.Shipment.Package[0].PackageWeight.Weight).toBe('5');
        expect(body.RateRequest.Shipment.Package[1].PackageWeight.Weight).toBe('3');
        });
    });

    describe('street2 field mapping', () => {
        it('maps street2 when present in origin', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValueOnce(authFixture);
        http.post.mockResolvedValueOnce(successFixture);

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const carrier = new UpsCarrier(authClient, http);
        const service = new RateService([carrier]);

        const requestWithStreet2: RateRequest = {
            ...validRequest,
            origin: { ...validRequest.origin, street2: 'Suite 200' },
        };

        await service.getRates(requestWithStreet2);

        const [, body] = http.post.mock.calls[0] as [string, any, any];
        expect(body.RateRequest.Shipment.Shipper.Address.AddressLine).toEqual([
            '400 Perimeter Center Terrace',
            'Suite 200',
        ]);
        });

        it('maps street2 when present in destination', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValueOnce(authFixture);
        http.post.mockResolvedValueOnce(successFixture);

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const carrier = new UpsCarrier(authClient, http);
        const service = new RateService([carrier]);

        const requestWithStreet2: RateRequest = {
            ...validRequest,
            destination: { ...validRequest.destination, street2: 'Building 43' },
        };

        await service.getRates(requestWithStreet2);

        const [, body] = http.post.mock.calls[0] as [string, any, any];
        expect(body.RateRequest.Shipment.ShipTo.Address.AddressLine).toEqual([
            '1600 Amphitheatre Pkwy',
            'Building 43',
        ]);
        });

        it('only includes street1 when street2 is not present', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValueOnce(authFixture);
        http.post.mockResolvedValueOnce(successFixture);

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const carrier = new UpsCarrier(authClient, http);
        const service = new RateService([carrier]);

        await service.getRates(validRequest);

        const [, body] = http.post.mock.calls[0] as [string, any, any];
        expect(body.RateRequest.Shipment.Shipper.Address.AddressLine).toEqual([
            '400 Perimeter Center Terrace',
        ]);
        });
    });

    describe('Token expiry mid-flight (401 auto-retry)', () => {
        it('automatically refreshes token and retries on 401', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValue(authFixture);
        
        // First rate call returns 401, second succeeds
        http.post
            .mockRejectedValueOnce(new HttpError(401, null))
            .mockResolvedValueOnce(successFixture);

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const carrier = new UpsCarrier(authClient, http);
        const service = new RateService([carrier]);

        const quotes = await service.getRates(validRequest);

        // Should have fetched auth twice (initial + retry)
        expect(http.postForm).toHaveBeenCalledTimes(2);
        // Should have attempted rate call twice (fail + retry)
        expect(http.post).toHaveBeenCalledTimes(2);
        // Final result should be successful
        expect(quotes).toHaveLength(3);
        });

        it('does not retry infinitely on repeated 401s', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValue(authFixture);
        http.post.mockRejectedValue(new HttpError(401, null));

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const carrier = new UpsCarrier(authClient, http);
        const service = new RateService([carrier]);

        // With partial failure handling, service returns empty array when all carriers fail
        const quotes = await service.getRates(validRequest);
        expect(quotes).toEqual([]);

        // Should have attempted exactly twice (original + one retry)
        expect(http.post).toHaveBeenCalledTimes(2);
        });
    });

    describe('Partial carrier failure handling', () => {
        it('returns quotes from successful carriers when one fails', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValue(authFixture);
        http.post.mockResolvedValueOnce(successFixture);

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const upsCarrier = new UpsCarrier(authClient, http);

        // Mock carrier that always fails
        const failingCarrier: Carrier = {
            getRates: jest.fn().mockRejectedValue(new Error('Carrier down')),
        };

        const service = new RateService([upsCarrier, failingCarrier]);

        const quotes = await service.getRates(validRequest);

        // Should still get UPS quotes even though second carrier failed
        expect(quotes).toHaveLength(3);
        expect(quotes[0].carrier).toBe('UPS');
        });

        it('returns empty array when all carriers fail', async () => {
        const failingCarrier1: Carrier = {
            getRates: jest.fn().mockRejectedValue(new Error('Carrier 1 down')),
        };
        const failingCarrier2: Carrier = {
            getRates: jest.fn().mockRejectedValue(new Error('Carrier 2 down')),
        };

        const service = new RateService([failingCarrier1, failingCarrier2]);

        const quotes = await service.getRates(validRequest);

        expect(quotes).toEqual([]);
        });

        it('aggregates quotes from multiple successful carriers', async () => {
        const mockCarrier1: Carrier = {
            getRates: jest.fn().mockResolvedValue([
            {
                carrier: 'Carrier1',
                serviceCode: '01',
                serviceName: 'Express',
                amount: 10.0,
                currency: 'USD',
            },
            ] as RateQuote[]),
        };

        const mockCarrier2: Carrier = {
            getRates: jest.fn().mockResolvedValue([
            {
                carrier: 'Carrier2',
                serviceCode: '02',
                serviceName: 'Ground',
                amount: 5.0,
                currency: 'USD',
            },
            ] as RateQuote[]),
        };

        const service = new RateService([mockCarrier1, mockCarrier2]);

        const quotes = await service.getRates(validRequest);

        expect(quotes).toHaveLength(2);
        expect(quotes.map((q) => q.carrier)).toEqual(['Carrier1', 'Carrier2']);
        });
    });

    describe('Network error classification', () => {
        it('classifies ECONNRESET as retryable network error', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValue(authFixture);
        
        const networkError = new Error('socket hang up');
        networkError.message = 'ECONNRESET';
        http.post.mockRejectedValueOnce(networkError);

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const carrier = new UpsCarrier(authClient, http);

        // test carrier directly to verify error classification
        await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
            code: 'NETWORK_ERROR',
            carrier: 'UPS',
            retryable: true,
        });
        });

        it('classifies ETIMEDOUT as retryable network error', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValue(authFixture);
        
        const networkError = new Error('timeout of 10000ms exceeded');
        networkError.message = 'ETIMEDOUT';
        http.post.mockRejectedValueOnce(networkError);

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const carrier = new UpsCarrier(authClient, http);

        // Test carrier directly to verify error classification
        await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
            code: 'NETWORK_ERROR',
            carrier: 'UPS',
            retryable: true,
        });
        });

        it('distinguishes network errors from malformed responses', async () => {
        const http = makeHttpStub();
        http.postForm.mockResolvedValue(authFixture);
        
        // return JSON that fails Zod validation
        http.post.mockResolvedValueOnce({ invalid: 'response' });

        const authClient = new UpsAuthClient(http, 'id', 'secret');
        const carrier = new UpsCarrier(authClient, http);

        // test carrier directly to verify error classification
        await expect(carrier.getRates(validRequest)).rejects.toMatchObject({
            code: 'INVALID_RESPONSE',
            carrier: 'UPS',
            retryable: false, // malformed responses are NOT retryable
        });
        });
    });
    });
