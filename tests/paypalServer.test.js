import { Readable } from 'node:stream';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePayPalRequest } from '../server/paypal.js';
import { loadEnvFile } from '../server/loadEnv.js';

const ENV = {
  PAYPAL_MODE: 'sandbox',
  PAYPAL_CLIENT_ID: 'sandbox-client',
  PAYPAL_CLIENT_SECRET: 'sandbox-secret',
  PAYPAL_MERCHANT_EMAIL: 'lemonquake@gmail.com',
};

const paypalResponse = (data, ok = true, status = ok ? 200 : 422) => ({ ok, status, json: async () => data });

function request(method, url, body) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = url;
  return req;
}

function response() {
  return {
    headers: {}, statusCode: 0, raw: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = '') { this.raw = String(value); },
    json() { return JSON.parse(this.raw); },
  };
}

async function call(method, url, body, env = ENV) {
  const res = response();
  expect(await handlePayPalRequest(request(method, url, body), res, env)).toBe(true);
  return res;
}

const completedOrder = (overrides = {}) => ({
  id: 'ORDER-ABC12345',
  status: 'COMPLETED',
  purchase_units: [{
    custom_id: 'reactor',
    payee: { email_address: 'lemonquake@gmail.com' },
    payments: { captures: [{ id: 'CAPTURE-123', status: 'COMPLETED', amount: { currency_code: 'USD', value: '19.99' } }] },
    ...overrides,
  }],
});

describe('PayPal ticket server', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns safe public configuration without exposing the client secret', async () => {
    const res = await call('GET', '/api/paypal/config', undefined, ENV);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ enabled: true, mode: 'sandbox', clientId: 'sandbox-client', merchantEmail: 'lemonquake@gmail.com' });
    expect(res.raw).not.toContain('sandbox-secret');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('creates an order from the server catalog and ignores client-supplied price or ticket values', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(paypalResponse({ access_token: 'token' }))
      .mockResolvedValueOnce(paypalResponse({ id: 'ORDER-NEW12345', status: 'CREATED' }, true, 201));
    vi.stubGlobal('fetch', fetch);
    const res = await call('POST', '/api/paypal/orders', { bundleId: 'reactor', price: '0.01', tickets: 999999 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 'ORDER-NEW12345', status: 'CREATED' });
    const [url, options] = fetch.mock.calls[1];
    const payload = JSON.parse(options.body);
    expect(url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
    expect(payload.purchase_units[0]).toMatchObject({
      custom_id: 'reactor',
      payee: { email_address: 'lemonquake@gmail.com' },
      amount: { currency_code: 'USD', value: '19.99' },
    });
    expect(payload.purchase_units[0].items[0]).toMatchObject({ quantity: '1', category: 'DIGITAL_GOODS' });
  });

  it('returns a minimal verified receipt only after a completed capture', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(paypalResponse({ access_token: 'token' }))
      .mockResolvedValueOnce(paypalResponse(completedOrder()));
    vi.stubGlobal('fetch', fetch);
    const res = await call('POST', '/api/paypal/orders/ORDER-ABC12345/capture');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true, orderId: 'ORDER-ABC12345', captureId: 'CAPTURE-123', tickets: 170,
      bundleId: 'reactor', status: 'COMPLETED', merchant: 'lemonquake@gmail.com',
    });
  });

  it.each([
    ['wrong amount', completedOrder({ payments: { captures: [{ id: 'CAPTURE-123', status: 'COMPLETED', amount: { currency_code: 'USD', value: '0.01' } }] } }), 'captured amount'],
    ['wrong currency', completedOrder({ payments: { captures: [{ id: 'CAPTURE-123', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '19.99' } }] } }), 'captured amount'],
    ['wrong payee', completedOrder({ payee: { email_address: 'attacker@example.com' } }), 'creator account'],
  ])('rejects a completed response with the %s', async (_label, order, message) => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(paypalResponse({ access_token: 'token' }))
      .mockResolvedValueOnce(paypalResponse(order)));
    const res = await call('POST', '/api/paypal/orders/ORDER-ABC12345/capture');
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain(message);
  });

  it('recovers an already-captured order and validates the retrieved receipt', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(paypalResponse({ access_token: 'token-1' }))
      .mockResolvedValueOnce(paypalResponse({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }, false))
      .mockResolvedValueOnce(paypalResponse({ access_token: 'token-2' }))
      .mockResolvedValueOnce(paypalResponse(completedOrder()));
    vi.stubGlobal('fetch', fetch);
    const res = await call('POST', '/api/paypal/orders/ORDER-ABC12345/capture');
    expect(res.statusCode).toBe(200);
    expect(res.json().tickets).toBe(170);
    expect(fetch.mock.calls[3][0]).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-ABC12345');
    expect(fetch.mock.calls[3][1].method).toBe('GET');
  });

  it('rejects invalid bundle and order identifiers without contacting PayPal', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await call('POST', '/api/paypal/orders', { bundleId: 'not-real' })).json().error).toBe('Unknown ticket pack.');
    expect((await call('POST', '/api/paypal/orders/bad!/capture')).json().error).toBe('Invalid PayPal order ID.');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('production environment loading', () => {
  it('loads a local .env without overriding secrets already supplied by the host', () => {
    const directory = mkdtempSync(join(tmpdir(), 'destructo-env-'));
    const file = join(directory, '.env');
    writeFileSync(file, 'PAYPAL_MODE=live\nPAYPAL_CLIENT_ID="local-client"\nPAYPAL_CLIENT_SECRET=local-secret\n# ignored\n');
    const env = { PAYPAL_CLIENT_SECRET: 'host-secret' };
    try {
      expect(loadEnvFile(file, env)).toBe(2);
      expect(env).toEqual({ PAYPAL_MODE: 'live', PAYPAL_CLIENT_ID: 'local-client', PAYPAL_CLIENT_SECRET: 'host-secret' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
