/**
 * The buyer's pay/don't-pay decision is the climax of the demo, so it must
 * never assert something the checks did not observe.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from './buyer-agent';

const c = (id: string, outcome: string) => ({ id, outcome, summary: '' });

describe('decide — the buyer pays only on evidence', () => {
  test('REGRESSION: refused probe + no quote is NOT "will pay, correctly quoting"', () => {
    // A real run: HTTP 403 on both probes, verdict UNKNOWN. The first version
    // of decide() said "WILL PAY — alive and correctly quoting". It was neither.
    const d = decide('UNKNOWN', [c('P1', 'warn'), c('P2', 'warn')]);
    assert.equal(d.pay, false);
    assert.match(d.why, /refused/);
    assert.doesNotMatch(d.why, /correctly quoting/);
  });

  test('UNKNOWN with a valid quote and a live endpoint pays under a cap', () => {
    const d = decide('UNKNOWN', [c('P1', 'pass'), c('P2', 'pass')]);
    assert.equal(d.pay, true);
    assert.match(d.why, /small cap/);
  });

  test('no valid quote means nothing to pay, even if alive', () => {
    const d = decide('UNKNOWN', [c('P1', 'pass'), c('P2', 'warn')]);
    assert.equal(d.pay, false);
    assert.match(d.why, /nothing to pay/);
  });

  test('bad verdicts never pay', () => {
    for (const v of ['DEAD', 'UNSAFE', 'CAUTION']) {
      assert.equal(decide(v, [c('P1', 'pass'), c('P2', 'pass')]).pay, false, v);
    }
  });

  test('SAFE with a valid quote pays', () => {
    assert.equal(decide('SAFE', [c('P1', 'pass'), c('P2', 'pass'), c('P4', 'pass')]).pay, true);
  });

  test('an unrecognised verdict refuses by default', () => {
    assert.equal(decide('WEIRD', [c('P1', 'pass'), c('P2', 'pass')]).pay, false);
  });

  test('every reason for paying is backed by a passing P2', () => {
    // Property: whenever the buyer decides to pay, P2 passed.
    const bands = ['SAFE', 'UNKNOWN', 'CAUTION', 'UNSAFE', 'DEAD'];
    const outs = ['pass', 'warn', 'fail', 'skipped'];
    for (const v of bands) for (const p1 of outs) for (const p2 of outs) {
      const d = decide(v, [c('P1', p1), c('P2', p2)]);
      if (d.pay) assert.equal(p2, 'pass', `paid with P2=${p2} (verdict ${v}, P1 ${p1})`);
    }
  });
});
