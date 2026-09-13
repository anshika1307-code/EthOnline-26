/**
 * P1 accumulated three separate measurement bugs, every one of which made the
 * ecosystem look worse than it is. These pin the corrections so they cannot
 * regress silently.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAlive, median } from './p1-liveness';

describe('isAlive — what counts as a live endpoint', () => {
  test('2xx is alive', () => {
    for (const s of [200, 201, 204, 299]) assert.equal(isAlive(s), true, `${s}`);
  });

  test('402 is alive — for a paywalled resource it is the CORRECT answer', () => {
    // Regression: counting only 2xx marked every payable agent in the registry
    // as dead, which was the exact opposite of the truth.
    assert.equal(isAlive(402), true);
  });

  test('other 4xx/5xx are not alive', () => {
    for (const s of [400, 401, 403, 404, 405, 422, 429, 500, 502, 503]) {
      assert.equal(isAlive(s), false, `${s} should not count as alive`);
    }
  });

  test('3xx is not counted directly — redirects are followed before we judge', () => {
    assert.equal(isAlive(301), false);
    assert.equal(isAlive(302), false);
  });
});

describe('median', () => {
  test('odd and even length', () => {
    assert.equal(median([5]), 5);
    assert.equal(median([1, 3, 5]), 3);
    assert.equal(median([1, 3]), 2);
    assert.equal(median([10, 2, 4, 8]), 6);
  });

  test('does not assume sorted input', () => {
    assert.equal(median([9, 1, 5]), 5);
  });

  test('empty is 0, not NaN', () => {
    // A NaN here would render as "median NaNms" in a published report.
    assert.equal(median([]), 0);
  });
});
