/**
 * Preflight testbed — three x402-gated endpoints we own, behaving differently
 * on purpose so the scanner can be shown separating them.
 *
 *   POST /good          correct: middleware verifies + settles, handler delivers
 *   POST /bad-replay    caches the payment check — the same proof buys forever
 *   POST /bad-delivery  settles the payment, then returns 500 and no resource
 *   POST /bad-payee     a perfectly well-formed quote to a Hedera account that does not exist
 *
 * See ETHICS.md — these are the ONLY hosts Group A checks may run against.
 */
import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';

const {
  HEDERA_RECEIVER_ACCOUNT_ID,
  FACILITATOR_URL = 'https://blocky402.com',
  FACILITATOR_TIMEOUT_MS = '30000',
  PRICE_TINYBAR = '1000000',
  PORT = '8402',
} = process.env;

const HEDERA_NETWORK = (process.env.HEDERA_NETWORK ?? 'hedera:testnet') as `${string}:${string}`;

if (!HEDERA_RECEIVER_ACCOUNT_ID) {
  console.error('Missing HEDERA_RECEIVER_ACCOUNT_ID. Copy .env.example to .env.');
  process.exit(1);
}

/** HBAR is asset 0.0.0 and amounts are in tinybars (1 HBAR = 1e8 tinybar). */
const HBAR_ASSET = '0.0.0';
const price = { asset: HBAR_ASSET, amount: PRICE_TINYBAR };

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  timeoutMs: Number(FACILITATOR_TIMEOUT_MS),
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  'hedera:*',
  new ExactHederaScheme({
    defaultAssets: {
      [HEDERA_NETWORK]: { asset: HBAR_ASSET, decimals: 8 },
    },
  }),
);

/**
 * THE BUG in /bad-payee: a typo'd receiving account. Nothing about the quote is
 * malformed — scheme, network, amount, asset all correct — so a quote validator
 * (Preflight P2) passes it. Only a ledger lookup shows nobody can be paid there.
 * A buyer loses nothing (Hedera rejects the transfer), but the seller can never
 * be paid, so an agent should not route work to it. Must not exist on the
 * network; checked against the mirror node when this was written.
 */
const BAD_PAYEE_ACCOUNT_ID = process.env.BAD_PAYEE_ACCOUNT_ID ?? '0.0.999999999';

function accepts(description: string, extra?: Record<string, unknown>, payTo = HEDERA_RECEIVER_ACCOUNT_ID!) {
  return {
    accepts: {
      scheme: 'exact',
      price,
      network: HEDERA_NETWORK,
      payTo,
      ...(extra ? { extra } : {}),
    },
    description,
    mimeType: 'application/json',
  };
}

/**
 * Settle BEFORE the handler runs.
 *
 * This is what makes /bad-delivery a genuine "paid-but-denied" case. With the
 * default flow the money only moves after the handler returns successfully, so
 * a handler that 500s never charges the customer — which is safe, and not the
 * failure mode the papers describe. Settling upfront is the configuration that
 * actually loses the buyer money.
 */
const SETTLE_UPFRONT = { paymentFlow: 'upfront' };

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    network: HEDERA_NETWORK,
    payTo: HEDERA_RECEIVER_ACCOUNT_ID,
    priceTinybar: PRICE_TINYBAR,
    routes: ['POST /good', 'POST /bad-replay', 'POST /bad-delivery', 'POST /bad-payee'],
  });
});

/**
 * THE BUG in /bad-replay.
 *
 * A correct server treats a payment proof as single-use. This one remembers
 * that a proof "was valid once" and short-circuits on every later sighting of
 * it — so one payment buys the resource forever. That is the free-shopping
 * failure mode from Five Attacks on x402 (arXiv:2605.11781).
 *
 * Implemented as a shim ahead of the payment middleware, because the
 * middleware itself does the right thing and we have to actively defeat it.
 */
/** x402 v2 payment header. `X-PAYMENT` is v1 and is NOT what the client sends. */
const PAYMENT_HEADER = 'PAYMENT-SIGNATURE';

const seenProofs = new Set<string>();

function replayShim(req: Request, res: Response, next: NextFunction) {
  const proof = req.header(PAYMENT_HEADER);
  if (proof && seenProofs.has(proof)) {
    res.status(200).json({
      ok: true,
      route: 'bad-replay',
      resource: { message: 'served again on a reused payment proof', servedAt: new Date().toISOString() },
      replayed: true,
    });
    return;
  }
  next();
}

app.post('/bad-replay', replayShim);

app.use(
  paymentMiddleware(
    {
      'POST /good': accepts('Preflight testbed: correct implementation'),
      'POST /bad-replay': accepts('Preflight testbed: replayable payment proof'),
      'POST /bad-delivery': accepts(
        'Preflight testbed: takes payment, delivers nothing',
        SETTLE_UPFRONT,
      ),
      'POST /bad-payee': accepts('Preflight testbed: pays an account that does not exist', undefined, BAD_PAYEE_ACCOUNT_ID),
    },
    resourceServer,
  ),
);

app.post('/good', (_req, res) => {
  res.json({
    ok: true,
    route: 'good',
    resource: { message: 'Preflight testbed delivered.', servedAt: new Date().toISOString() },
  });
});

app.post('/bad-replay', (req, res) => {
  const proof = req.header(PAYMENT_HEADER);
  if (proof) seenProofs.add(proof); // remembering this is precisely the bug
  res.json({
    ok: true,
    route: 'bad-replay',
    resource: { message: 'served on first payment', servedAt: new Date().toISOString() },
    replayed: false,
  });
});

app.post('/bad-payee', (_req, res) => {
  // Unreachable in practice: settlement to a missing account fails first.
  res.json({ ok: true, route: 'bad-payee' });
});

/** THE BUG in /bad-delivery: payment settled upstream, nothing comes back. */
app.post('/bad-delivery', (_req, res) => {
  res.status(500).json({ error: 'internal error' });
});

app.listen(Number(PORT), () => {
  console.log(`Preflight testbed on :${PORT}  (${HEDERA_NETWORK}, payTo ${HEDERA_RECEIVER_ACCOUNT_ID})`);
  console.log(`  POST /good          -> SAFE`);
  console.log(`  POST /bad-replay    -> UNSAFE (A1 replay)`);
  console.log(`  POST /bad-delivery  -> UNSAFE (P4 delivery)`);
  console.log(`  POST /bad-payee     -> quote passes P2; payee ${BAD_PAYEE_ACCOUNT_ID} does not exist on the ledger`);
});
