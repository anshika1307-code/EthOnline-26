/**
 * Verdict derivation and report rendering.
 *
 * These guard the two things that would quietly publish something wrong:
 * a verdict that does not follow from the checks, and a report that leaks a
 * third-party host or reads as an accusation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveVerdict, type CheckResult } from './types';
import { buildReport, renderReport, renderOneLine } from './report';

const at = '2026-09-12T00:00:00.000Z';
const check = (
  id: CheckResult['id'],
  outcome: CheckResult['outcome'],
  summary = 'x',
): CheckResult => ({ id, outcome, summary, evidence: {}, observedAt: at });

describe('deriveVerdict', () => {
  test('P1 failing is DEAD, and outranks everything else', () => {
    assert.equal(deriveVerdict([check('P1', 'fail')]), 'DEAD');
    assert.equal(deriveVerdict([check('P1', 'fail'), check('P4', 'fail')]), 'DEAD');
  });

  test('P4 failing is UNSAFE', () => {
    assert.equal(deriveVerdict([check('P1', 'pass'), check('P4', 'fail')]), 'UNSAFE');
  });

  test('any active check failing is UNSAFE', () => {
    assert.equal(deriveVerdict([check('P1', 'pass'), check('A1', 'fail')]), 'UNSAFE');
  });

  test('UNSAFE outranks CAUTION when both apply', () => {
    const v = deriveVerdict([check('P2', 'fail'), check('P3', 'fail'), check('P4', 'fail')]);
    assert.equal(v, 'UNSAFE');
  });

  test('P2 or P3 failing alone is CAUTION', () => {
    assert.equal(deriveVerdict([check('P1', 'pass'), check('P2', 'fail')]), 'CAUTION');
    assert.equal(deriveVerdict([check('P1', 'pass'), check('P3', 'fail')]), 'CAUTION');
  });

  test('all passing INCLUDING P4 is SAFE, and a warn does not block it', () => {
    assert.equal(deriveVerdict([check('P1', 'pass'), check('P4', 'pass')]), 'SAFE');
    assert.equal(
      deriveVerdict([check('P1', 'pass'), check('P4', 'pass'), check('P5', 'warn')]),
      'SAFE',
    );
  });

  test('alive but never paid is UNKNOWN, not SAFE — SAFE is a claim about paying', () => {
    // The whole product question is "is it safe to pay this endpoint". If P4
    // never ran we have not tested paying, so we must not say SAFE.
    assert.equal(deriveVerdict([check('P1', 'pass')]), 'UNKNOWN');
    assert.equal(
      deriveVerdict([check('P1', 'pass'), check('P2', 'pass'), { ...check('P4', 'skipped') }]),
      'UNKNOWN',
    );
  });

  test('nothing ran is UNKNOWN, not SAFE', () => {
    assert.equal(deriveVerdict([]), 'UNKNOWN');
    assert.equal(deriveVerdict([check('A1', 'skipped'), check('P4', 'skipped')]), 'UNKNOWN');
  });
});

describe('renderReport', () => {
  const report = buildReport(
    { endpoint: 'https://someone-elses-agent.xyz/api/quote', agentId: '413', chain: 'hedera:testnet' },
    [
      check('P1', 'pass', 'responded 3/3, median 305ms'),
      check('P4', 'fail', 'paid 1000000 0.0.0, endpoint returned HTTP 500, no resource delivered'),
      check('P2', 'pass', 'quote well-formed'),
      { ...check('A1', 'skipped'), skippedReason: 'third-party endpoint' },
    ],
  );

  test('verdict is UNSAFE and is spelled out, not just a word', () => {
    assert.equal(report.verdict, 'UNSAFE');
    assert.match(renderReport(report), /VERDICT\s+UNSAFE — do not pay/);
  });

  test('failures are listed before passes', () => {
    const out = renderReport(report);
    assert.ok(out.indexOf('✗ P4') < out.indexOf('✓ P1'), 'P4 fail should precede P1 pass');
  });

  test('states that active checks were withheld, and why', () => {
    assert.match(renderReport(report), /A1 not run: third-party endpoint, passive mode only/);
  });

  test('anonymise hides the host but keeps the path', () => {
    const out = renderReport(report, { anonymise: true, anonymousId: 'endpoint-7' });
    assert.doesNotMatch(out, /someone-elses-agent\.xyz/);
    assert.match(out, /<endpoint-7>\/api\/quote/);
  });

  test('does not anonymise unless asked (local debugging keeps the host)', () => {
    assert.match(renderReport(report), /someone-elses-agent\.xyz/);
  });

  test('renders no accusatory language', () => {
    const out = renderReport(report).toLowerCase();
    for (const word of ['scam', 'fraud', 'steal', 'malicious', 'thief']) {
      assert.doesNotMatch(out, new RegExp(word), `report must not contain "${word}"`);
    }
  });

  test('one-liner names the failing checks', () => {
    assert.match(renderOneLine(report), /^UNSAFE\s+.*failed: P4/);
  });

  test('a target with no checks renders UNKNOWN rather than throwing', () => {
    const empty = buildReport({ endpoint: 'https://x.example/', chain: 'hedera:testnet' }, []);
    assert.equal(empty.verdict, 'UNKNOWN');
    assert.match(renderReport(empty), /\(no checks completed\)/);
  });
});
