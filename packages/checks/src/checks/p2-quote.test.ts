/**
 * P2/P3 pure-logic tests. The network half of P2 is exercised against the
 * testbed; these cover the parts that decide whether we publish a claim.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractAdvertisedPrice, checkPriceConsistency, type Quote } from './p2-quote.js';

const quote = (amount: string, asset = '0.0.0'): Quote => ({
  scheme: 'exact',
  network: 'hedera:testnet',
  amount,
  asset,
  payTo: '0.0.1',
});

describe('extractAdvertisedPrice', () => {
  test('reads a structured price', () => {
    assert.deepEqual(extractAdvertisedPrice({ price: { amount: '1000', asset: '0.0.0' } }), {
      amount: '1000',
      asset: '0.0.0',
    });
  });

  test('accepts a bare integer string', () => {
    assert.deepEqual(extractAdvertisedPrice({ pricing: '250' }), { amount: '250' });
  });

  test('returns null for a real ERC-8004 service entry (no price field exists)', () => {
    assert.equal(
      extractAdvertisedPrice({ name: 'MCP', endpoint: 'https://x.example/', version: '2025-06-18' }),
      null,
    );
  });

  test('does NOT invent a price from prose', () => {
    // Guessing a number out of free text and then publishing a "mismatch"
    // against it would be an unfounded accusation. ETHICS.md §6.
    assert.equal(extractAdvertisedPrice({ description: 'only 0.01 HBAR per call!' }), null);
    assert.equal(extractAdvertisedPrice({ price: 'cheap' }), null);
    assert.equal(extractAdvertisedPrice({ price: '0.01' }), null); // not atomic units
  });

  test('handles undefined', () => {
    assert.equal(extractAdvertisedPrice(undefined), null);
  });
});

describe('checkPriceConsistency', () => {
  test('matching price passes', () => {
    const r = checkPriceConsistency(quote('1000'), { amount: '1000' });
    assert.equal(r.outcome, 'pass');
  });

  test('mismatch fails and states both numbers', () => {
    const r = checkPriceConsistency(quote('2000'), { amount: '500' });
    assert.equal(r.outcome, 'fail');
    assert.match(r.summary, /advertised 500/);
    assert.match(r.summary, /quoted 2000/);
    assert.match(r.summary, /4\.00x/);
  });

  test('no advertised price is SKIPPED, never a failure', () => {
    // The registration schema has no price field; absence is not misconduct.
    const r = checkPriceConsistency(quote('1000'), null);
    assert.equal(r.outcome, 'skipped');
    assert.match(r.skippedReason ?? '', /no machine-readable price/);
  });

  test('no quote is skipped, not failed', () => {
    assert.equal(checkPriceConsistency(null, { amount: '1' }).outcome, 'skipped');
  });

  test('different assets warn rather than claim a mismatch', () => {
    const r = checkPriceConsistency(quote('1000', '0.0.0'), { amount: '1000', asset: '0.0.429274' });
    assert.equal(r.outcome, 'warn');
    assert.match(r.summary, /not directly comparable/);
  });

  test('handles amounts beyond Number.MAX_SAFE_INTEGER without overflowing', () => {
    const big = '99999999999999999999999';
    assert.equal(checkPriceConsistency(quote(big), { amount: big }).outcome, 'pass');
  });
});
