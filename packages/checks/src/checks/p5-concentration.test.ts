import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeConcentration,
  checkConcentration,
  registrableDomain,
  anonymiseDomains,
  CONCENTRATION_WARN_THRESHOLD,
} from './p5-concentration';

const ep = (agentId: string, url: string, owner?: string) => ({ agentId, url, owner });

describe('registrableDomain', () => {
  test('collapses subdomains to the registrable domain', () => {
    assert.equal(registrableDomain('mesh.heurist.xyz'), 'heurist.xyz');
    assert.equal(registrableDomain('raw.githubusercontent.com'), 'githubusercontent.com');
    assert.equal(registrableDomain('example.com'), 'example.com');
  });

  test('handles known multi-part suffixes', () => {
    assert.equal(registrableDomain('agent.example.co.uk'), 'example.co.uk');
    assert.equal(registrableDomain('someone.github.io'), 'someone.github.io');
  });
});

describe('computeConcentration', () => {
  test('single domain owning everything is 100%', () => {
    const s = computeConcentration({
      endpoints: [ep('1', 'https://a.solo.xyz/x'), ep('2', 'https://b.solo.xyz/y')],
    });
    assert.equal(s.domainCount, 1);
    assert.equal(s.topDomainShare, 1);
    assert.equal(s.hostCount, 2, 'distinct hosts still counted separately');
  });

  test('computes share across several domains', () => {
    const s = computeConcentration({
      endpoints: [
        ep('1', 'https://a.one.com/'),
        ep('2', 'https://b.one.com/'),
        ep('3', 'https://c.one.com/'),
        ep('4', 'https://two.com/'),
      ],
    });
    assert.equal(s.endpointCount, 4);
    assert.equal(s.topDomainShare, 0.75);
    assert.equal(s.byDomain[0].agents, 3);
  });

  test('owner concentration is computed alongside domains', () => {
    const s = computeConcentration({
      endpoints: [
        ep('1', 'https://a.com/', '0xAAA'),
        ep('2', 'https://b.com/', '0xAAA'),
        ep('3', 'https://c.com/', '0xAAA'),
        ep('4', 'https://d.com/', '0xBBB'),
      ],
    });
    assert.equal(s.ownerCount, 2);
    assert.equal(s.topOwnerShare, 0.75);
  });

  test('empty corpus does not divide by zero', () => {
    const s = computeConcentration({ endpoints: [] });
    assert.equal(s.endpointCount, 0);
    assert.equal(s.topDomainShare, 0);
    assert.equal(s.topTenOwnerShare, 0);
  });

  test('unparseable urls are skipped, not counted as a domain', () => {
    const s = computeConcentration({ endpoints: [ep('1', 'not a url'), ep('2', 'https://ok.com/')] });
    assert.equal(s.domainCount, 1);
  });
});

describe('checkConcentration', () => {
  const stats = computeConcentration({
    endpoints: [
      ep('1', 'https://a.big.com/'),
      ep('2', 'https://b.big.com/'),
      ep('3', 'https://c.big.com/'),
      ep('4', 'https://small.com/'),
    ],
  });
  const labels = anonymiseDomains(stats);

  test('warns above the documented threshold', () => {
    const r = checkConcentration('https://a.big.com/', stats, { labels });
    assert.equal(r.outcome, 'warn');
    assert.ok(stats.topDomainShare > CONCENTRATION_WARN_THRESHOLD);
    assert.match(r.summary, /75% of the 4 declared endpoints/);
  });

  test('passes for a minor domain', () => {
    assert.equal(checkConcentration('https://small.com/', stats, { labels }).outcome, 'pass');
  });

  test('anonymises the domain by default', () => {
    const r = checkConcentration('https://a.big.com/', stats, { labels });
    assert.doesNotMatch(r.summary, /big\.com/);
    assert.match(r.summary, /domain-1/);
  });

  test('can show the real domain when explicitly asked', () => {
    const r = checkConcentration('https://a.big.com/', stats, { anonymise: false });
    assert.match(r.summary, /big\.com/);
  });

  test('an endpoint outside the corpus is skipped, not scored', () => {
    const r = checkConcentration('https://elsewhere.net/', stats, { labels });
    assert.equal(r.outcome, 'skipped');
  });
});
