/**
 * Preflight, sold per call.
 *
 * An agent about to pay a stranger's API can pay a fraction of a cent to ask
 * "is it safe?" first. This is brief v3 front door #3, and it is the same
 * x402 machinery the agents we scan are supposed to be using — we eat our own
 * dog food on Hedera.
 *
 *   GET  /health   free
 *   GET  /pricing  free — what a check costs and what it runs
 *   POST /check    x402-gated, metered:
 *                    { "endpoint": "https://..." }                  -> one report
 *                    { "endpoints": [...], "depth": "liveness" }    -> one report per endpoint
 *
 * PRICING IS METERED, not flat: unit(depth) × endpoints. See ./metering.ts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ABUSE BOUNDARY — read before adding a check here.
 *
 * A paid API that runs checks against a caller-supplied URL is an attack proxy
 * if you let it be. This endpoint therefore runs **Group P (passive) only**:
 * P1 liveness and P2 quote validity. Both are things an ordinary customer does
 * — one request, no payment, nothing adversarial.
 *
 * Group A (replay, idempotency, settlement timing, allowance scope) is NOT
 * reachable through this API at any price, and must never be added. Those run
 * only against our own testbed, from our own CLI. See ETHICS.md §1 rule 2.
 * ─────────────────────────────────────────────────────────────────────────
 */
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';

import { checkLiveness } from '../../../packages/checks/src/checks/p1-liveness';
import { checkQuote, checkPriceConsistency } from '../../../packages/checks/src/checks/p2-quote';
import { buildReport, renderReport } from '../../../packages/checks/src/report';
import type { CheckResult } from '../../../packages/checks/src/types';
import { hcsConfigured, submitReceipt, type Receipt } from './hcs';
import { MAX_ENDPOINTS, UNIT_TINYBAR, parseCheckRequest, priceForBody, quoteTinybar, type CheckRequest } from './metering';

const {
  HEDERA_RECEIVER_ACCOUNT_ID,
  FACILITATOR_URL = 'https://api.testnet.blocky402.com',
  FACILITATOR_TIMEOUT_MS = '30000',
  PORT = '8403',
} = process.env;

const HEDERA_NETWORK = (process.env.HEDERA_NETWORK ?? 'hedera:testnet') as `${string}:${string}`;
const HBAR_ASSET = '0.0.0';

if (!HEDERA_RECEIVER_ACCOUNT_ID) {
  console.error('Missing HEDERA_RECEIVER_ACCOUNT_ID — copy testbed/.env.example.');
  process.exit(1);
}

const resourceServer = new x402ResourceServer(
  new HTTPFacilitatorClient({ url: FACILITATOR_URL, timeoutMs: Number(FACILITATOR_TIMEOUT_MS) }),
)
  .register(
    'hedera:*',
    new ExactHederaScheme({ defaultAssets: { [HEDERA_NETWORK]: { asset: HBAR_ASSET, decimals: 8 } } }),
  )
  /**
   * Write the audit receipt only AFTER the payment has actually settled, so a
   * receipt on HCS always corresponds to money that moved. The hook sees both
   * the settlement and the handler's response body, which is the report.
   */
  .onAfterSettle(async (ctx) => {
    if (!hcsConfigured() || !ctx.result.success) return;
    try {
      const transport = ctx.transportContext as { responseBody?: Buffer } | undefined;
      const body = transport?.responseBody ? JSON.parse(transport.responseBody.toString('utf8')) : null;
      // Single-endpoint responses are a bare report; batches carry `reports`.
      const reports: Array<{ target: { endpoint?: string }; verdict: string; checks: CheckResult[] }> =
        body?.reports ?? (body?.target ? [body] : []);
      if (reports.length === 0) return; // not a /check response

      const req = ctx.requirements as unknown as Record<string, string>;
      const receipt: Receipt = {
        type: 'preflight.receipt.v1',
        checked: reports.map((r) => r.target.endpoint ?? '').join(' '),
        verdict: reports.map((r) => r.verdict).join(','),
        checks:
          reports.length === 1
            ? Object.fromEntries(reports[0].checks.map((c) => [c.id, c.outcome]))
            : {},
        meter: body.meter,
        payment: {
          payer: ctx.result.payer ?? null,
          amount: ctx.result.amount ?? req.amount ?? null,
          asset: req.asset ?? null,
          payTo: req.payTo ?? null,
          network: ctx.result.network,
          settlement: ctx.result.transaction,
        },
        at: new Date().toISOString(),
      };
      const written = await submitReceipt(receipt);
      if (written) {
        console.log(`  receipt → HCS ${process.env.HCS_TOPIC_ID} seq ${written.sequence} (settlement ${ctx.result.transaction})`);
      }
    } catch (err) {
      // The buyer already paid and already has their report. A receipt failure
      // is ours to fix, not theirs to suffer, so it never fails the request.
      console.error('  HCS receipt write failed:', err instanceof Error ? err.message : err);
    }
  });

const app = express();
app.use(express.json({ limit: '8kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'preflight', network: HEDERA_NETWORK });
});

app.get('/receipts', (_req, res) => {
  const topic = process.env.HCS_TOPIC_ID;
  if (!topic) return res.status(404).json({ error: 'HCS audit trail not configured' });
  res.json({
    topic,
    format: 'preflight.receipt.v1',
    note: 'One message per settled check. Only our submit key can write, so receipts cannot be forged.',
    verify: `https://testnet.mirrornode.hedera.com/api/v1/topics/${topic}/messages`,
    explorer: `https://hashscan.io/testnet/topic/${topic}`,
  });
});

app.get('/pricing', (_req, res) => {
  res.json({
    model: 'metered',
    formula: 'amount = unitTinybar[depth] × number of distinct endpoints',
    asset: HBAR_ASSET,
    network: HEDERA_NETWORK,
    unit: 'tinybar',
    unitTinybar: {
      liveness: { amount: UNIT_TINYBAR.liveness.toString(), runs: ['P1 liveness'] },
      full: {
        amount: UNIT_TINYBAR.full.toString(),
        runs: ['P1 liveness', 'P2 quote validity', 'P3 price consistency (when a price is advertised)'],
        default: true,
      },
    },
    maxEndpointsPerRequest: MAX_ENDPOINTS,
    examples: [
      { body: { endpoint: 'https://...' }, amount: priceForBody({ endpoint: 'https://a.test/' }) },
      {
        body: { endpoints: ['https://...', 'https://...', 'https://...'], depth: 'liveness' },
        amount: priceForBody({ endpoints: ['https://a.test/', 'https://b.test/', 'https://c.test/'], depth: 'liveness' }),
      },
    ],
    howToQuote: 'POST /check without payment — the 402 PAYMENT-REQUIRED header carries the exact amount for that body',
    neverRuns: {
      groupA: ['A1 replay', 'A2 idempotency', 'A3 settlement timing', 'A4 allowance scope'],
      why: 'adversarial checks against third parties are unauthorised testing — see ETHICS.md',
    },
    payTo: HEDERA_RECEIVER_ACCOUNT_ID,
  });
});

app.use(
  paymentMiddleware(
    {
      'POST /check': {
        accepts: {
          scheme: 'exact',
          // Metered: the quote is computed from the request body, and the paid
          // retry is re-priced from its own body, so a payment signed for a
          // one-endpoint quote cannot cover a ten-endpoint request.
          price: (ctx) => ({ asset: HBAR_ASSET, amount: priceForBody(ctx.adapter.getBody?.()) }),
          network: HEDERA_NETWORK,
          payTo: HEDERA_RECEIVER_ACCOUNT_ID!,
        },
        description: 'Preflight safety check, metered per endpoint and depth (passive checks only)',
        mimeType: 'application/json',
      },
    },
    resourceServer,
  ),
);

function badRequest(res: Response, message: string) {
  res.status(400).json({ error: message });
}

async function runChecks(endpoint: string, depth: CheckRequest['depth']) {
  const checks: CheckResult[] = [];
  // Passive only. See the abuse boundary at the top of this file.
  checks.push(await checkLiveness(endpoint));
  if (depth === 'full') {
    const { check: p2, quote } = await checkQuote(endpoint);
    checks.push(p2);
    // No registration metadata in scope for an ad-hoc URL, so P3 has nothing
    // advertised to compare against and reports why rather than guessing.
    checks.push(checkPriceConsistency(quote, null));
  }
  const report = buildReport({ endpoint, chain: HEDERA_NETWORK }, checks);
  return { ...report, rendered: renderReport(report, { anonymise: false }) };
}

app.post('/check', async (req: Request, res: Response) => {
  // The same parser that priced this request decides the work, so what runs
  // is exactly what was paid for.
  const parsed = parseCheckRequest(req.body);
  if (!parsed.ok) return badRequest(res, parsed.error);
  const { endpoints, depth } = parsed.request;

  const meter = {
    depth,
    endpoints: endpoints.length,
    unitTinybar: UNIT_TINYBAR[depth].toString(),
    amountTinybar: quoteTinybar(parsed.request).toString(),
  };
  const note = 'Passive checks only. Adversarial checks are never run against third parties (ETHICS.md).';

  const reports = await Promise.all(endpoints.map((e) => runChecks(e, depth)));

  // `{ endpoint }` keeps its original response shape so existing callers
  // (including the buyer agent) are unaffected.
  if (!Array.isArray(req.body?.endpoints)) return res.json({ ...reports[0], meter, note });
  res.json({ meter, reports, note });
});

app.listen(Number(PORT), () => {
  console.log(`Preflight API on :${PORT}  (${HEDERA_NETWORK})`);
  console.log(`  GET  /health   free`);
  console.log(`  GET  /pricing  free`);
  console.log(`  POST /check    metered: ${UNIT_TINYBAR.full} tinybar/endpoint full, ${UNIT_TINYBAR.liveness} liveness (max ${MAX_ENDPOINTS}) -> payTo ${HEDERA_RECEIVER_ACCOUNT_ID}`);
  console.log(`  GET  /receipts ${hcsConfigured() ? `HCS audit trail on ${process.env.HCS_TOPIC_ID}` : 'HCS not configured'}`);
});
