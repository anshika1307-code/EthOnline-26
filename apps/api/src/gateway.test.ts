import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { createGatewayRouter, hederaPayToFromQuote, openApiSpec } from './gateway';
import type { CheckRun } from './run-checks';
import type { Depth } from './metering';

const KEY = 'test-key-not-a-secret';
const calls: Array<{ endpoint: string; depth: Depth }> = [];

/** No network: a fake run that records what it was asked to do. */
async function fakeRun(endpoint: string, depth: Depth): Promise<CheckRun> {
  calls.push({ endpoint, depth });
  return {
    target: { endpoint, chain: 'bazantic-gateway' },
    verdict: 'UNKNOWN',
    checks: [{ id: 'P1', outcome: 'pass', summary: 'alive', observedAt: 'now' } as CheckRun['checks'][number]],
    activeChecksRun: false,
    generatedAt: 'now',
    rendered: '',
    quote: depth === 'full' ? { version: 2, scheme: 'exact', network: 'hedera:testnet', amount: '1000000', asset: '0.0.0', payTo: '0.0.10475917' } : null,
  };
}

function serve(key: string | undefined) {
  const app = express();
  app.use('/gw', createGatewayRouter({ key, publicUrl: 'https://preflight.test', run: fakeRun }));
  let server: Server;
  let base = '';
  return {
    start: () => new Promise<void>((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; r(); }); }),
    stop: () => new Promise<void>((r) => server.close(() => r())),
    post: (path: string, body: unknown, auth?: string) =>
      fetch(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
        body: JSON.stringify(body),
      }),
    get: (path: string) => fetch(base + path),
  };
}

describe('gateway — disabled without a key', () => {
  const s = serve(undefined);
  before(s.start);
  after(s.stop);

  test('every route 404s, including the spec', async () => {
    assert.equal((await s.post('/gw/check', { endpoint: 'https://a.acme.dev/' }, `Bearer ${KEY}`)).status, 404);
    assert.equal((await s.get('/gw/openapi.json')).status, 404);
  });
});

describe('gateway — enabled', () => {
  const s = serve(KEY);
  before(s.start);
  after(s.stop);

  test('no credential, wrong credential, or wrong scheme is 401 and runs nothing', async () => {
    const n = calls.length;
    for (const auth of [undefined, 'Bearer wrong', `Basic ${KEY}`, `Bearer ${KEY}x`, 'Bearer ']) {
      assert.equal((await s.post('/gw/check', { endpoint: 'https://a.acme.dev/' }, auth)).status, 401, String(auth));
    }
    assert.equal(calls.length, n);
  });

  test('full check returns verdict, structured quote and the Hedera payTo', async () => {
    const r = await s.post('/gw/check', { endpoint: 'https://a.acme.dev/' }, `Bearer ${KEY}`);
    assert.equal(r.status, 200);
    const body = (await r.json()) as any;
    assert.equal(body.depth, 'full');
    assert.equal(body.quote.payTo, '0.0.10475917');
    assert.deepEqual(body.hederaPayTo, { account: '0.0.10475917', network: 'testnet' });
    assert.deepEqual(calls.at(-1), { endpoint: 'https://a.acme.dev/', depth: 'full' });
  });

  test('liveness route runs liveness depth only', async () => {
    const r = await s.post('/gw/liveness', { endpoint: 'https://a.acme.dev/' }, `Bearer ${KEY}`);
    const body = (await r.json()) as any;
    assert.equal(body.depth, 'liveness');
    assert.equal(body.hederaPayTo, null);
    assert.equal(calls.at(-1)?.depth, 'liveness');
  });

  test('a caller cannot upgrade depth through the body', async () => {
    await s.post('/gw/liveness', { endpoint: 'https://a.acme.dev/', depth: 'full' }, `Bearer ${KEY}`);
    assert.equal(calls.at(-1)?.depth, 'liveness');
  });

  test('batches are refused — the gateway prices per call', async () => {
    const n = calls.length;
    const r = await s.post('/gw/check', { endpoints: ['https://a.acme.dev/', 'https://b.acme.dev/'] }, `Bearer ${KEY}`);
    assert.equal(r.status, 400);
    assert.equal(calls.length, n);
  });

  test('private targets are refused before anything runs', async () => {
    const n = calls.length;
    for (const endpoint of ['http://169.254.169.254/latest', 'http://localhost:8403/', 'not a url', '']) {
      assert.equal((await s.post('/gw/check', { endpoint }, `Bearer ${KEY}`)).status, 400, endpoint);
    }
    assert.equal(calls.length, n);
  });

  test('the spec is public and describes exactly the two gateway operations', async () => {
    const r = await s.get('/gw/openapi.json');
    assert.equal(r.status, 200);
    const spec = (await r.json()) as any;
    assert.deepEqual(Object.keys(spec.paths).sort(), ['/gw/check', '/gw/liveness']);
    assert.equal(spec.servers[0].url, 'https://preflight.test');
    assert.deepEqual(
      Object.values(spec.paths).map((p: any) => p.post.operationId).sort(),
      ['preflightCheckEndpoint', 'preflightLivenessCheck'],
    );
  });
});

describe('hederaPayToFromQuote', () => {
  test('reads v2 and v1 network spellings', () => {
    assert.deepEqual(hederaPayToFromQuote({ network: 'hedera:mainnet', payTo: '0.0.123' }), { account: '0.0.123', network: 'mainnet' });
    assert.deepEqual(hederaPayToFromQuote({ network: 'hedera-testnet', payTo: '0.0.9' }), { account: '0.0.9', network: 'testnet' });
  });

  test('returns null rather than guessing for non-Hedera or malformed payTo', () => {
    assert.equal(hederaPayToFromQuote({ network: 'eip155:8453', payTo: '0xabc' }), null);
    assert.equal(hederaPayToFromQuote({ network: 'hedera:testnet', payTo: '0xf36e67653c38667435c5f995C0B120d3954D1c21' }), null);
    assert.equal(hederaPayToFromQuote({ network: 'hedera:devnet', payTo: '0.0.1' }), null);
    assert.equal(hederaPayToFromQuote(null), null);
  });
});

test('openApiSpec does not expose the Hedera x402 route or batching', () => {
  const spec = JSON.stringify(openApiSpec('https://x.test'));
  assert.ok(!spec.includes('"/check"'));
  assert.ok(!spec.includes('"endpoints":'));
});
