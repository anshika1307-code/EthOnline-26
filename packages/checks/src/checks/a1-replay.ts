/**
 * A1 — Replay window.
 *
 * Pay once legitimately, capture the exact payment proof that went over the
 * wire, then present that same proof again. A correct server treats a proof as
 * single-use. A vulnerable one serves the resource again, so one payment buys
 * forever — the "free shopping" failure mode in arXiv:2605.11781 and
 * arXiv:2607.19545.
 *
 * ⚠ THIS IS A GROUP A (ACTIVE) CHECK.
 * It runs ONLY against endpoints we deployed ourselves. Replaying a payment
 * proof at someone else's service is unauthorised testing — the papers did it
 * under responsible disclosure and that authorisation does not transfer to us.
 * See ETHICS.md §1 rule 2. The guard below is the enforcement, not the comment.
 */
import { wrapFetchWithPayment } from '@x402/fetch';
import { x402Client } from '@x402/core/client';
import { createClientHederaSigner, PrivateKey } from '@x402/hedera';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { assertOwnTestbed } from '../guard.js';
import type { CheckResult } from '../types.js';
import type { P4Config } from './p4-delivery.js';

const USER_AGENT = 'Preflight/0.1 (+https://github.com/preflight/preflight) ERC-8004 endpoint checker';

/** x402 v2 payment header. `X-PAYMENT` is the v1 legacy name, kept as fallback. */
const PAYMENT_HEADER = 'PAYMENT-SIGNATURE';
const PAYMENT_HEADER_V1 = 'X-PAYMENT';

/**
 * Wraps a fetch so we can see the X-PAYMENT header the client actually sent.
 *
 * The header can arrive either on `init.headers` or on a `Request` passed as
 * `input`, depending on how the payment wrapper rebuilds the retry — check
 * both, or the proof is silently missed and A1 reports "nothing to replay".
 */
function capturingFetch(base: typeof fetch, sink: { header?: string }): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const pick = (h: Headers) => h.get(PAYMENT_HEADER) ?? h.get(PAYMENT_HEADER_V1);
    const fromInit = pick(new Headers(init?.headers));
    const fromRequest =
      typeof input === 'object' && input !== null && 'headers' in input
        ? pick(new Headers((input as Request).headers))
        : null;
    const sent = fromInit ?? fromRequest;
    if (sent) sink.header = sent;
    return base(input, init);
  }) as typeof fetch;
}

export async function checkReplay(endpoint: string, cfg: P4Config): Promise<CheckResult> {
  // ── ETHICS GATE — first line, no exceptions. Throws for anything not ours.
  assertOwnTestbed(endpoint, 'A1');

  const observedAt = new Date().toISOString();
  const evidence: Record<string, unknown> = { endpoint, network: cfg.network };

  const signer = createClientHederaSigner(
    cfg.accountId,
    PrivateKey.fromStringECDSA(cfg.privateKey),
    { network: cfg.network },
  );
  const client = new x402Client()
    .register('hedera:*', new ExactHederaScheme(signer))
    .setSpendControls({
      allowedAssets: [
        { network: cfg.network, asset: cfg.asset, maxAmountPerPayment: cfg.maxAmountPerPayment },
      ],
    });

  const sink: { header?: string } = {};
  const payingFetch = wrapFetchWithPayment(capturingFetch(fetch, sink), client) as typeof fetch;

  const headers = { 'content-type': 'application/json', 'user-agent': USER_AGENT };

  // ── 1. One legitimate payment.
  let first: Response;
  try {
    first = await payingFetch(endpoint, {
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 60_000),
    });
  } catch (err) {
    evidence.error = err instanceof Error ? err.message : String(err);
    return {
      id: 'A1',
      outcome: 'warn',
      summary: `could not establish a baseline payment: ${evidence.error}`,
      evidence,
      observedAt,
    };
  }

  const firstBody = await first.text().catch(() => '');
  evidence.firstStatus = first.status;
  evidence.firstBodyExcerpt = firstBody.slice(0, 300);

  if (!sink.header) {
    evidence.note = 'no payment header was sent — endpoint never required payment';
    return {
      id: 'A1',
      outcome: 'warn',
      summary: 'no payment proof was produced, so there was nothing to replay',
      evidence,
      observedAt,
    };
  }
  evidence.proofBytes = sink.header.length;

  // ── 2. Replay the SAME proof. Plain fetch — we deliberately do not create a
  //       second payment, so anything delivered here is delivered for free.
  let second: Response;
  try {
    second = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, [PAYMENT_HEADER]: sink.header },
      body: '{}',
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 60_000),
    });
  } catch (err) {
    evidence.replayError = err instanceof Error ? err.message : String(err);
    return {
      id: 'A1',
      outcome: 'pass',
      summary: `replayed proof was refused (${evidence.replayError})`,
      evidence,
      observedAt,
    };
  }

  const secondBody = await second.text().catch(() => '');
  evidence.replayStatus = second.status;
  evidence.replayBodyExcerpt = secondBody.slice(0, 300);

  const servedAgain = second.ok && secondBody.trim().length > 0;

  if (servedAgain) {
    return {
      id: 'A1',
      outcome: 'fail',
      summary:
        `the same payment proof was accepted twice — replaying it returned HTTP ${second.status} ` +
        `with a resource, so one payment buys repeat service (free shopping)`,
      evidence,
      observedAt,
    };
  }

  return {
    id: 'A1',
    outcome: 'pass',
    summary: `replayed payment proof was rejected (HTTP ${second.status})`,
    evidence,
    observedAt,
  };
}
