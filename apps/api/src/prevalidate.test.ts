import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { rejectInvalidCheck } from './prevalidate';

// Stand-in for the x402 paywall: if a request reaches it, it would have been quoted.
let reachedPaywall = 0;
const app = express();
app.use(express.json({ limit: '8kb' }));
app.post('/check', rejectInvalidCheck);
app.use((_req, res) => {
  reachedPaywall++;
  res.status(402).json({ quote: true });
});

let server: Server;
let base = '';
before(() => new Promise<void>((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; r(); }); }));
after(() => new Promise<void>((r) => server.close(() => r())));

const post = (body: unknown) =>
  fetch(`${base}/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('requests we would refuse are 400 and never quoted', async () => {
  const n = reachedPaywall;
  for (const body of [
    { endpoint: 'http://169.254.169.254/latest' },
    { endpoint: 'http://localhost:8403/check' },
    { endpoint: 'not a url' },
    { endpoints: Array.from({ length: 11 }, (_, i) => `https://h${i}.acme.dev/`) },
    { endpoint: 'https://a.acme.dev/', depth: 'deep' },
    {},
  ]) {
    const r = await post(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(((await r.json()) as { charged: boolean }).charged, false);
  }
  assert.equal(reachedPaywall, n);
});

test('valid requests pass through to the paywall untouched', async () => {
  const n = reachedPaywall;
  assert.equal((await post({ endpoint: 'https://a.acme.dev/' })).status, 402);
  assert.equal((await post({ endpoints: ['https://a.acme.dev/', 'https://b.acme.dev/'], depth: 'liveness' })).status, 402);
  assert.equal(reachedPaywall, n + 2);
});
