/**
 * P4 — Delivery.
 *
 * Make ONE ordinary, legitimate payment and check whether the resource comes
 * back. "Paid-but-denied" is the headline failure mode in both core papers
 * (arXiv:2605.11781, arXiv:2607.19545).
 *
 * This is a PASSIVE check: it is exactly what a normal paying customer does.
 * It is safe to run against third-party endpoints — but it spends real money,
 * so the spend cap in ETHICS.md §5 is enforced here, not just documented.
 */
import { wrapFetchWithPayment } from '@x402/fetch';
import { x402Client } from '@x402/core/client';
import { createClientHederaSigner, PrivateKey } from '@x402/hedera';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import type { CheckResult } from '../types.js';

const USER_AGENT = 'Preflight/0.1 (+https://github.com/preflight/preflight) ERC-8004 endpoint checker';

export type P4Config = {
  accountId: string;
  /** ECDSA private key, 0x-prefixed. */
  privateKey: string;
  network: `${string}:${string}`;
  /** Hard per-payment cap in atomic units (tinybars for HBAR). ETHICS.md §5. */
  maxAmountPerPayment: string;
  asset: string;
  timeoutMs?: number;
};

/** What the client actually agreed to pay, captured as it signs. */
export type PaidQuote = { amount?: string; asset?: string; payTo?: string; network?: string };

/**
 * Builds a paying fetch with the spend cap enforced before any payment is
 * signed, plus a hook that records the requirements actually selected.
 *
 * The hook matters for honest reporting: without it we would only know our own
 * cap, not the price we were charged, and ETHICS.md §6 forbids publishing a
 * number we did not observe.
 */
export function createPayingFetch(cfg: P4Config): { fetch: typeof fetch; quote: PaidQuote } {
  const signer = createClientHederaSigner(
    cfg.accountId,
    PrivateKey.fromStringECDSA(cfg.privateKey),
    { network: cfg.network },
  );

  const quote: PaidQuote = {};

  const client = new x402Client()
    .register('hedera:*', new ExactHederaScheme(signer))
    .setSpendControls({
      // Atomic per-asset cap. Refuses to sign anything above this.
      allowedAssets: [
        { network: cfg.network, asset: cfg.asset, maxAmountPerPayment: cfg.maxAmountPerPayment },
      ],
    })
    .onAfterPaymentCreation(async (ctx) => {
      const r = ctx.selectedRequirements as unknown as Record<string, unknown>;
      quote.amount = r?.amount as string | undefined;
      quote.asset = r?.asset as string | undefined;
      quote.payTo = r?.payTo as string | undefined;
      quote.network = r?.network as string | undefined;
    });

  return { fetch: wrapFetchWithPayment(fetch, client) as typeof fetch, quote };
}

/** Pulls the settlement receipt the server echoes back, if present. */
function readSettlement(res: Response): Record<string, unknown> | null {
  // v2 is PAYMENT-RESPONSE; X-PAYMENT-RESPONSE is the v1 legacy name.
  const header = res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('X-PAYMENT-RESPONSE');
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    return { raw: header.slice(0, 200) };
  }
}

/**
 * Runs P4 against one endpoint.
 *
 * Outcomes:
 *   pass — paid, and a non-empty resource came back
 *   fail — paid, and it did not (the finding this project exists for)
 *   warn — never got as far as paying (no 402, or the cap refused it)
 */
export async function checkDelivery(
  endpoint: string,
  cfg: P4Config,
  init: RequestInit = { method: 'POST' },
): Promise<CheckResult> {
  const observedAt = new Date().toISOString();
  const { fetch: payingFetch, quote } = createPayingFetch(cfg);
  const startedAt = Date.now();

  const evidence: Record<string, unknown> = {
    endpoint,
    network: cfg.network,
    asset: cfg.asset,
    maxAmountPerPayment: cfg.maxAmountPerPayment,
  };

  let res: Response;
  try {
    res = await payingFetch(endpoint, {
      ...init,
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT, ...(init.headers ?? {}) },
      body: init.body ?? JSON.stringify({}),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 60_000),
    });
  } catch (err) {
    evidence.error = err instanceof Error ? err.message : String(err);
    evidence.elapsedMs = Date.now() - startedAt;
    return {
      id: 'P4',
      outcome: 'warn',
      summary: `could not complete a payment attempt: ${evidence.error}`,
      evidence,
      observedAt,
    };
  }

  const elapsedMs = Date.now() - startedAt;
  const bodyText = await res.text().catch(() => '');
  const settlement = readSettlement(res);

  evidence.elapsedMs = elapsedMs;
  evidence.status = res.status;
  evidence.settlement = settlement;
  evidence.bodyExcerpt = bodyText.slice(0, 500);
  evidence.bodyBytes = bodyText.length;
  evidence.quote = quote;

  const paid = settlement !== null;

  // Never reached payment — no 402 offered, or our cap refused it.
  if (!paid) {
    return {
      id: 'P4',
      outcome: 'warn',
      summary:
        res.status === 402
          ? 'endpoint kept returning 402; no payment was settled (price may exceed our cap)'
          : `no payment was required or settled (HTTP ${res.status})`,
      evidence,
      observedAt,
    };
  }

  // Paid and got nothing usable back. This is the finding.
  if (!res.ok || bodyText.trim().length === 0) {
    return {
      id: 'P4',
      outcome: 'fail',
      summary: `paid ${quote.amount ?? 'an unrecorded amount of'} ${quote.asset ?? cfg.asset} (atomic units), endpoint returned HTTP ${res.status}${
        bodyText.trim().length === 0 ? ' with an empty body' : ''
      }, no resource delivered`,
      evidence,
      observedAt,
    };
  }

  return {
    id: 'P4',
    outcome: 'pass',
    summary: `paid and received a resource (HTTP ${res.status}, ${bodyText.length} bytes, ${elapsedMs}ms)`,
    evidence,
    observedAt,
  };
}
