import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCheckRequest, quoteTinybar, priceForBody, UNIT_TINYBAR, MAX_ENDPOINTS } from './metering';

const A = 'https://a.acme.dev/api';
const B = 'https://b.acme.dev/api';

describe('metered pricing — price is the work', () => {
  test('a single endpoint at full depth costs one full unit (unchanged from flat pricing)', () => {
    assert.equal(priceForBody({ endpoint: A }), '100000');
  });

  test('price scales with the number of endpoints', () => {
    assert.equal(priceForBody({ endpoints: [A] }), '100000');
    assert.equal(priceForBody({ endpoints: [A, B] }), '200000');
  });

  test('a shallower check is cheaper per endpoint', () => {
    assert.equal(priceForBody({ endpoint: A, depth: 'liveness' }), '40000');
    assert.equal(priceForBody({ endpoints: [A, B], depth: 'liveness' }), '80000');
    assert.ok(UNIT_TINYBAR.liveness < UNIT_TINYBAR.full);
  });

  test('duplicates are not charged twice', () => {
    assert.equal(priceForBody({ endpoints: [A, A, A] }), '100000');
  });

  test('the handler does exactly the work that was priced', () => {
    // Same function, same body → same endpoint list the price was computed from.
    const body = { endpoints: [A, B, A], depth: 'liveness' };
    const parsed = parseCheckRequest(body);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.request.endpoints, [A, B]);
    assert.equal(quoteTinybar(parsed.request).toString(), priceForBody(body));
  });
});

describe('metering — rejects what it must not charge for', () => {
  test('too many endpoints is rejected, not silently truncated', () => {
    const many = Array.from({ length: MAX_ENDPOINTS + 1 }, (_, i) => `https://h${i}.acme.dev/`);
    const r = parseCheckRequest({ endpoints: many });
    assert.equal(r.ok, false);
  });

  test('an unknown depth is rejected rather than defaulted', () => {
    assert.equal(parseCheckRequest({ endpoint: A, depth: 'deep' }).ok, false);
  });

  test('non-http and malformed URLs are rejected', () => {
    assert.equal(parseCheckRequest({ endpoint: 'ftp://x.acme.dev/' }).ok, false);
    assert.equal(parseCheckRequest({ endpoint: 'not a url' }).ok, false);
  });

  test('an empty or missing body is rejected', () => {
    for (const b of [undefined, null, {}, { endpoints: [] }, { endpoint: '' }]) {
      assert.equal(parseCheckRequest(b).ok, false, JSON.stringify(b));
    }
  });

  test('an unparseable body still gets a price, so the middleware can respond', () => {
    // The handler then 400s, and a failed handler cancels settlement.
    assert.equal(priceForBody({ nonsense: true }), UNIT_TINYBAR.full.toString());
  });

  test('worst-case price is bounded', () => {
    const max = Array.from({ length: MAX_ENDPOINTS }, (_, i) => `https://h${i}.acme.dev/`);
    assert.equal(priceForBody({ endpoints: max }), (UNIT_TINYBAR.full * BigInt(MAX_ENDPOINTS)).toString());
  });
});

describe('metering — never prices a request it would refuse to run', () => {
  test('private and metadata targets are rejected, so they are never charged', () => {
    for (const e of ['http://localhost:8403/check', 'http://169.254.169.254/latest', 'http://10.0.0.1/']) {
      assert.equal(parseCheckRequest({ endpoint: e }).ok, false, e);
    }
    // One bad endpoint poisons the batch rather than being silently dropped.
    assert.equal(parseCheckRequest({ endpoints: [A, 'http://127.0.0.1/'] }).ok, false);
  });
});
