import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeReceipt, type Receipt } from './hcs';

const base: Receipt = {
  type: 'preflight.receipt.v1',
  checked: 'https://a.acme.dev/api',
  verdict: 'UNKNOWN',
  checks: { P1: 'pass', P2: 'pass', P3: 'skipped' },
  meter: { depth: 'full', endpoints: 1, unitTinybar: '100000', amountTinybar: '100000' },
  payment: {
    payer: '0.0.10475912', amount: '100000', asset: '0.0.0', payTo: '0.0.10475917',
    network: 'hedera:testnet', settlement: '0.0.7162784@1789295746.951052963',
  },
  at: '2026-09-13T00:00:00.000Z',
};

test('a small receipt is written unchanged', () => {
  assert.deepEqual(JSON.parse(encodeReceipt(base)), base);
});

test('a batch of ten long URLs still encodes to valid JSON within one HCS message', () => {
  const long = Array.from({ length: 10 }, (_, i) => `https://h${i}.acme.dev/${'p'.repeat(150)}`);
  const receipt: Receipt = {
    ...base,
    checked: long.join(' '),
    verdict: long.map(() => 'CAUTION').join(','),
    meter: { depth: 'full', endpoints: 10, unitTinybar: '100000', amountTinybar: '1000000' },
  };
  const out = encodeReceipt(receipt);
  assert.ok(Buffer.byteLength(out) <= 1000, `${Buffer.byteLength(out)} bytes`);
  const parsed = JSON.parse(out); // must not throw
  // The parts that make the receipt verifiable survive the trim.
  assert.deepEqual(parsed.payment, receipt.payment);
  assert.deepEqual(parsed.meter, receipt.meter);
});
