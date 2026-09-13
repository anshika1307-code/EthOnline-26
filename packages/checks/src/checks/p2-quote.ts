/**
 * P2 — Quote validity, and P3 — Price consistency.
 *
 * P2 asks the endpoint what it charges, without paying, and checks the answer
 * is a well-formed x402 quote. A malformed or missing quote is the first thing
 * an attacker can exploit and the first thing a buyer cannot reason about
 * (arXiv:2605.11781).
 *
 * P3 compares that quote against the price the agent advertises in its
 * ERC-8004 registration. In practice the registration schema has no price
 * field, so this usually skips — see the note on `extractAdvertisedPrice`.
 *
 * Both are PASSIVE: one unauthenticated request, no payment, nothing
 * adversarial. Safe against third parties (ETHICS.md §1 rule 1).
 */
import type { CheckResult } from '../types';

const USER_AGENT = 'Preflight/0.1 (+https://github.com/anshika1307-code/EthOnline-26) ERC-8004 endpoint checker';

/** x402 v2 header. `X-PAYMENT-REQUIRED` is not a thing; v1 put the quote in the body. */
const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED';

export type Quote = {
  /** 1 or 2 — the field names and transport differ between them. */
  version?: number;
  scheme?: string;
  network?: string;
  amount?: string;
  asset?: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
};

export type QuoteResult = { check: CheckResult; quote: Quote | null };

/**
 * Required fields differ by protocol version, and getting this wrong produces
 * false accusations.
 *
 * x402 **v2** names the amount `amount` and puts the quote in a
 * `PAYMENT-REQUIRED` header. x402 **v1** names it `maxAmountRequired` and puts
 * the quote in the response body. A v2-only validator reports every v1 seller
 * as "missing amount" — which is the checker being wrong, not the seller.
 * We hit exactly that: four live agents were wrongly flagged before this.
 */
const REQUIRED_V2 = ['scheme', 'network', 'amount', 'asset', 'payTo'] as const;
const REQUIRED_V1 = ['scheme', 'network', 'maxAmountRequired', 'payTo'] as const;

/** The amount field for a given protocol version. */
function amountField(version: number): 'amount' | 'maxAmountRequired' {
  return version === 1 ? 'maxAmountRequired' : 'amount';
}

function decodeQuoteHeader(raw: string): unknown {
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
}

export async function checkQuote(
  endpoint: string,
  timeoutMs = 10_000,
  method: 'POST' | 'GET' = 'POST',
): Promise<QuoteResult> {
  const observedAt = new Date().toISOString();
  // Record the method: a 405/400 from a GET-only resource is not the same
  // finding as a genuine refusal to quote, and the reader needs to tell them apart.
  const evidence: Record<string, unknown> = { endpoint, method };
  const fail = (summary: string): QuoteResult => ({
    check: { id: 'P2', outcome: 'fail', summary, evidence, observedAt },
    quote: null,
  });
  const warn = (summary: string): QuoteResult => ({
    check: { id: 'P2', outcome: 'warn', summary, evidence, observedAt },
    quote: null,
  });

  let res: Response;
  const startedAt = Date.now();
  try {
    res = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      ...(method === 'POST' ? { body: '{}' } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    evidence.error = err instanceof Error ? err.message : String(err);
    return warn(`could not request a quote: ${evidence.error}`);
  }

  evidence.status = res.status;
  evidence.latencyMs = Date.now() - startedAt;

  if (res.status !== 402) {
    // Not a paywalled endpoint, or it paywalls differently. Not a defect in
    // itself — it just means there is no quote to validate.
    return warn(`no payment quote offered (HTTP ${res.status} to ${method}, expected 402)`);
  }

  const header = res.headers.get(PAYMENT_REQUIRED_HEADER);
  let payload: unknown = null;

  if (header) {
    evidence.source = 'PAYMENT-REQUIRED header';
    try {
      payload = decodeQuoteHeader(header);
    } catch (err) {
      evidence.headerExcerpt = header.slice(0, 120);
      return fail(`402 returned but the PAYMENT-REQUIRED header did not decode as JSON`);
    }
  } else {
    evidence.source = 'response body';
    const text = await res.text().catch(() => '');
    evidence.bodyExcerpt = text.slice(0, 300);
    try {
      payload = JSON.parse(text);
    } catch {
      return fail('402 returned with neither a PAYMENT-REQUIRED header nor a JSON body');
    }
  }

  const obj = (payload ?? {}) as Record<string, unknown>;
  const version = Number(obj.x402Version ?? 2);
  evidence.x402Version = version;
  const accepts = Array.isArray(obj.accepts) ? (obj.accepts as Record<string, unknown>[]) : [];
  evidence.acceptsCount = accepts.length;

  if (accepts.length === 0) {
    return fail('402 quote contains no `accepts` entries, so there is no way to pay it');
  }

  const first = accepts[0];
  const required = version === 1 ? REQUIRED_V1 : REQUIRED_V2;
  const missing = (required as readonly string[]).filter(
    (k) => first[k] === undefined || first[k] === '',
  );
  evidence.quote = first;
  evidence.missingFields = missing;

  if (missing.length > 0) {
    return fail(`402 quote (x402 v${version}) is missing required field(s): ${missing.join(', ')}`);
  }

  const amt = first[amountField(version)];
  if (typeof amt === 'string' && !/^\d+$/.test(amt)) {
    return fail(`402 quote amount is not an integer in atomic units: "${amt}"`);
  }

  const quote: Quote = {
    version,
    scheme: first.scheme as string,
    network: first.network as string,
    amount: first[amountField(version)] as string,
    asset: first.asset as string,
    payTo: first.payTo as string,
    maxTimeoutSeconds: first.maxTimeoutSeconds as number | undefined,
    extra: first.extra as Record<string, unknown> | undefined,
  };

  return {
    check: {
      id: 'P2',
      outcome: 'pass',
      summary:
        `quote well-formed (x402 v${version}) — ${quote.amount} of ${quote.asset ?? 'native'} ` +
        `on ${quote.network} to ${quote.payTo}` +
        (accepts.length > 1 ? ` (${accepts.length} options offered)` : ''),
      evidence,
      observedAt,
    },
    quote,
  };
}

/**
 * Pull an advertised price out of an ERC-8004 registration, if there is one.
 *
 * There usually is not. The ERC-8004 registration file has no price field —
 * `services[]` entries are `{name, endpoint, version}` — so unless an agent
 * adds a non-standard field there is nothing to compare a quote against. We
 * deliberately do NOT try to parse a price out of the free-text `description`:
 * guessing a number from prose and then publishing a "mismatch" against it
 * would be exactly the kind of unfounded accusation ETHICS.md §6 rules out.
 */
export function extractAdvertisedPrice(
  service: Record<string, unknown> | undefined,
): { amount: string; asset?: string } | null {
  if (!service) return null;
  const p = (service.price ?? service.pricing ?? service.cost) as unknown;
  if (p && typeof p === 'object') {
    const o = p as Record<string, unknown>;
    if (typeof o.amount === 'string' && /^\d+$/.test(o.amount)) {
      return { amount: o.amount, asset: typeof o.asset === 'string' ? o.asset : undefined };
    }
  }
  if (typeof p === 'string' && /^\d+$/.test(p)) return { amount: p };
  return null;
}

export function checkPriceConsistency(
  quote: Quote | null,
  advertised: { amount: string; asset?: string } | null,
): CheckResult {
  const observedAt = new Date().toISOString();
  const evidence: Record<string, unknown> = { quoted: quote?.amount, advertised: advertised?.amount };

  if (!quote) {
    return {
      id: 'P3',
      outcome: 'skipped',
      summary: 'no quote to compare',
      skippedReason: 'P2 did not obtain a valid quote',
      evidence,
      observedAt,
    };
  }

  if (!advertised) {
    return {
      id: 'P3',
      outcome: 'skipped',
      summary: 'agent advertises no price',
      skippedReason:
        'the ERC-8004 registration declares no machine-readable price, so the quote cannot be cross-checked',
      evidence,
      observedAt,
    };
  }

  if (advertised.asset && quote.asset && advertised.asset !== quote.asset) {
    return {
      id: 'P3',
      outcome: 'warn',
      summary: `advertised in ${advertised.asset} but quoted in ${quote.asset} — not directly comparable`,
      evidence,
      observedAt,
    };
  }

  const q = BigInt(quote.amount ?? '0');
  const a = BigInt(advertised.amount);
  evidence.ratio = a === 0n ? null : Number(q) / Number(a);

  if (q === a) {
    return {
      id: 'P3',
      outcome: 'pass',
      summary: `quoted price matches the advertised ${a} ${quote.asset ?? ''}`.trim(),
      evidence,
      observedAt,
    };
  }

  const times = a === 0n ? '∞' : `${(Number(q) / Number(a)).toFixed(2)}x`;
  return {
    id: 'P3',
    outcome: 'fail',
    summary: `advertised ${a}, quoted ${q} (${times})`,
    evidence,
    observedAt,
  };
}
