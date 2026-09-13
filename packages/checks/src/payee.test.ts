import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decide, payeeFacts, type MirrorAccount, type PreflightInput } from './payee';

const NOW = new Date('2026-09-13T12:00:00Z');
const secondsAgo = (days: number) => String(Math.floor(NOW.getTime() / 1000 - days * 86_400)) + '.000000000';

const quoting = (payTo = '0.0.10475917', network = 'hedera:testnet', asset = '0.0.0'): PreflightInput => ({
  endpoint: 'https://seller.acme.dev/api',
  verdict: 'UNKNOWN',
  checks: [
    { id: 'P1', outcome: 'pass', summary: 'alive' },
    { id: 'P2', outcome: 'pass', summary: 'quote well-formed' },
  ],
  quote: { network, amount: '1000000', asset, payTo },
  hederaPayTo: /^hedera:(mainnet|testnet)$/.test(network) && /^\d+\.\d+\.\d+$/.test(payTo)
    ? { account: payTo, network: network.split(':')[1] as 'testnet' | 'mainnet' }
    : null,
});

const account = (over: Partial<NonNullable<MirrorAccount>> = {}): MirrorAccount => ({
  account: '0.0.10475917',
  deleted: false,
  created_timestamp: secondsAgo(120),
  receiver_sig_required: false,
  max_automatic_token_associations: 0,
  ...over,
});

const paid = (n: number, to = '0.0.10475917') => ({
  transactions: Array.from({ length: n }, () => ({
    result: 'SUCCESS',
    transfers: [{ account: '0.0.1', amount: -100 }, { account: to, amount: 100 }],
  })),
  links: { next: null },
});

const facts = (pf: PreflightInput, acc: MirrorAccount, txs = paid(5), tokenAssociated: boolean | null = null) =>
  payeeFacts(pf.hederaPayTo!, acc, txs, { now: NOW, quoteAsset: pf.quote?.asset, tokenAssociated });

describe('Preflight alone decides the obvious cases — the mirror is not consulted', () => {
  test('dead endpoint', () => {
    const pf = { ...quoting(), verdict: 'DEAD', quote: null, hederaPayTo: null };
    assert.equal(decide(pf, null, ['testnet']).decision, 'DO_NOT_PAY');
  });

  test('malformed quote', () => {
    const pf = { ...quoting(), verdict: 'CAUTION', checks: [{ id: 'P2', outcome: 'fail', summary: 'missing payTo' }] };
    const a = decide(pf, null, ['testnet']);
    assert.equal(a.decision, 'DO_NOT_PAY');
    assert.equal(a.maxPayment, null);
  });

  test('alive but no quote', () => {
    assert.equal(decide({ ...quoting(), quote: null, hederaPayTo: null }, null, ['testnet']).decision, 'DO_NOT_PAY');
  });
});

describe('the mirror catches what a well-formed quote hides', () => {
  test('payee does not exist — P2 passed, the ledger says no', () => {
    const pf = quoting('0.0.999999999');
    const a = decide(pf, facts(pf, null, { transactions: [], links: { next: null } }), ['testnet']);
    assert.equal(a.decision, 'DO_NOT_PAY');
    assert.match(a.reasons[0], /does not exist/);
  });

  test('deleted payee', () => {
    const pf = quoting();
    assert.equal(decide(pf, facts(pf, account({ deleted: true })), ['testnet']).decision, 'DO_NOT_PAY');
  });

  test('receiver signature required — settlement cannot complete', () => {
    const pf = quoting();
    assert.equal(decide(pf, facts(pf, account({ receiver_sig_required: true })), ['testnet']).decision, 'DO_NOT_PAY');
  });

  test('HTS token quote to an account that cannot receive it', () => {
    const pf = quoting('0.0.10475917', 'hedera:testnet', '0.0.456858');
    assert.equal(decide(pf, facts(pf, account(), paid(5), false), ['testnet']).decision, 'DO_NOT_PAY');
    // -1 = unlimited automatic associations, so it can.
    assert.equal(decide(pf, facts(pf, account({ max_automatic_token_associations: -1 }), paid(5), false), ['testnet']).decision, 'PAY');
  });

  test('new account → small cap, capped at the quoted amount', () => {
    const pf = quoting();
    const a = decide(pf, facts(pf, account({ created_timestamp: secondsAgo(2) })), ['testnet']);
    assert.equal(a.decision, 'PAY_WITH_SMALL_CAP');
    assert.deepEqual(a.maxPayment, { amount: '1000000', asset: '0.0.0', network: 'hedera:testnet' });
  });

  test('never paid by anyone → small cap', () => {
    const pf = quoting();
    assert.equal(decide(pf, facts(pf, account(), paid(0)), ['testnet']).decision, 'PAY_WITH_SMALL_CAP');
  });

  test('outgoing transfers are not mistaken for incoming payments', () => {
    const pf = quoting();
    const outgoing = { transactions: [{ result: 'SUCCESS', transfers: [{ account: '0.0.10475917', amount: -5 }] }], links: { next: null } };
    assert.equal(facts(pf, account(), outgoing).inboundPayments, 0);
  });

  test('established, paid, receivable payee → PAY, still never "safe"', () => {
    const pf = quoting();
    const a = decide(pf, facts(pf, account()), ['testnet']);
    assert.equal(a.decision, 'PAY');
    assert.ok(a.reasons.some((r) => /delivery is unverified/.test(r)));
  });
});

describe('never cross networks', () => {
  test('a testnet payee with only a mainnet mirror is unverifiable, not verified', () => {
    // 0.0.10475917 exists on mainnet too, as a different account. Looking it up
    // there would "verify" the wrong account.
    const a = decide(quoting(), null, ['mainnet']);
    assert.equal(a.decision, 'CANNOT_VERIFY_PAYEE');
    assert.match(a.reasons[0], /not cross-checking/);
  });

  test('non-Hedera payee is out of scope, not a failure', () => {
    const pf = quoting('0x2Db0CaB17aC0bE0b0a2d1F1D4E2d7E8f9A0b1c2D', 'eip155:8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    assert.equal(decide(pf, null, ['testnet', 'mainnet']).decision, 'CANNOT_VERIFY_PAYEE');
  });
});
