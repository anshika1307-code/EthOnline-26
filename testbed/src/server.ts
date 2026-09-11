/**
 * Preflight testbed — three x402-gated endpoints we own, behaving differently
 * on purpose so the scanner can be shown separating them.
 *
 *   /good          correct: verify → nonce check → settle → deliver
 *   /bad-replay    accepts the same payment proof repeatedly (no nonce check)
 *   /bad-delivery  settles the payment, then returns 500 and no resource
 *
 * See ETHICS.md — these are the ONLY hosts Group A checks may run against.
 *
 * NOTE: written against the verified @x402/hedera@2.25.0 API (package README +
 * .d.ts). Not yet run against a live facilitator; expect to adjust the settle
 * response handling on first real run.
 */
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { x402ResourceServer } from '@x402/core/server';
import { HTTPFacilitatorClient } from '@x402/core/facilitator';
import { ExactHederaScheme } from '@x402/hedera/exact/server';

const {
  HEDERA_RECEIVER_ACCOUNT_ID,
  FACILITATOR_URL = 'https://blocky402.com',
  FACILITATOR_TIMEOUT_MS = '30000',
  HEDERA_NETWORK = 'hedera:testnet',
  PRICE_TINYBAR = '1000000',
  PORT = '8402',
} = process.env;

if (!HEDERA_RECEIVER_ACCOUNT_ID) {
  console.error('Missing HEDERA_RECEIVER_ACCOUNT_ID. Copy .env.example to .env.');
  process.exit(1);
}

/** HBAR is asset 0.0.0; amounts are in tinybars (1 HBAR = 1e8 tinybar). */
const HBAR_ASSET = '0.0.0';

const facilitator = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  timeoutMs: Number(FACILITATOR_TIMEOUT_MS),
});

const x402 = new x402ResourceServer(facilitator).register(
  'hedera:*',
  new ExactHederaScheme({
    defaultAssets: {
      [HEDERA_NETWORK]: { asset: HBAR_ASSET, decimals: 8 },
    },
  }),
);

/** What a caller must pay to use a given route. */
function requirementsFor(route: string) {
  return {
    scheme: 'exact',
    network: HEDERA_NETWORK,
    asset: HBAR_ASSET,
    maxAmountRequired: PRICE_TINYBAR,
    payTo: HEDERA_RECEIVER_ACCOUNT_ID,
    resource: `/${route}`,
    description: `Preflight testbed: ${route}`,
    mimeType: 'application/json',
  };
}

/**
 * Payment proofs we have already settled, so /good can refuse a replay.
 * /bad-replay deliberately does not consult this — that is its whole bug.
 */
const spentProofs = new Set<string>();

/** Stable key for a payment payload, used for replay detection. */
function proofKey(payload: unknown): string {
  return JSON.stringify(payload);
}

/** Reads the x402 payment header, if the caller sent one. */
function readPaymentHeader(req: Request): string | undefined {
  const header = req.header('X-PAYMENT') ?? req.header('x-payment');
  return header && header.length > 0 ? header : undefined;
}

/** Standard 402: tell the caller exactly what payment would satisfy us. */
function send402(res: Response, route: string) {
  res.status(402).json({
    x402Version: 2,
    error: 'payment required',
    accepts: [requirementsFor(route)],
  });
}

type Mode = 'good' | 'bad-replay' | 'bad-delivery';

function handler(mode: Mode) {
  return async (req: Request, res: Response) => {
    const header = readPaymentHeader(req);
    if (!header) return send402(res, mode);

    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'malformed X-PAYMENT header' });
    }

    const requirements = requirementsFor(mode);
    const key = proofKey(payload);

    // THE BUG in bad-replay: it never checks whether this proof was already used.
    if (mode !== 'bad-replay' && spentProofs.has(key)) {
      return res.status(409).json({ error: 'payment proof already used' });
    }

    try {
      const verification = await x402.verify(payload as never, requirements as never);
      if (!verification?.isValid) {
        return res.status(402).json({ error: 'payment verification failed', verification });
      }

      const settlement = await x402.settle(payload as never, requirements as never);
      spentProofs.add(key);

      // THE BUG in bad-delivery: it took the money and gives nothing back.
      if (mode === 'bad-delivery') {
        return res.status(500).json({ error: 'internal error' });
      }

      return res.status(200).json({
        ok: true,
        route: mode,
        resource: { message: `Preflight testbed ${mode} delivered.`, servedAt: new Date().toISOString() },
        settlement,
      });
    } catch (err) {
      return res.status(502).json({
        error: 'settlement error',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) =>
  res.json({ ok: true, network: HEDERA_NETWORK, payTo: HEDERA_RECEIVER_ACCOUNT_ID, priceTinybar: PRICE_TINYBAR }),
);

app.post('/good', handler('good'));
app.post('/bad-replay', handler('bad-replay'));
app.post('/bad-delivery', handler('bad-delivery'));

app.listen(Number(PORT), () => {
  console.log(`Preflight testbed on :${PORT}  (${HEDERA_NETWORK}, payTo ${HEDERA_RECEIVER_ACCOUNT_ID})`);
  console.log(`  POST /good           → SAFE`);
  console.log(`  POST /bad-replay     → UNSAFE (A1)`);
  console.log(`  POST /bad-delivery   → UNSAFE (P4)`);
});
