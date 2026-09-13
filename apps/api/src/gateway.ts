/**
 * Preflight as a Bazantic upstream.
 *
 * Bazantic puts its own x402/MPP gateway in front of an API: the agent pays
 * Bazantic (USDC), and Bazantic calls the upstream with a credential. It cannot
 * pay our Hedera x402 route, so these routes are a second front door onto the
 * SAME check run, authenticated with a shared key instead of a payment.
 *
 *   GET  /gw/openapi.json   the spec Bazantic imports (public — it describes, it doesn't run)
 *   POST /gw/check          { endpoint } → P1 + P2 + P3, plus the structured quote
 *   POST /gw/liveness       { endpoint } → P1 only
 *
 * One endpoint per call. Bazantic prices per method, not per body, so a batch
 * here would be work nobody paid for — metering by depth is two methods with
 * two prices instead.
 *
 * Same abuse boundary as the rest of the API: Group P only, private targets
 * refused (via parseCheckRequest). Disabled entirely unless a key is set.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import { parseCheckRequest, type Depth } from './metering';
import type { CheckRun } from './run-checks';

export type GatewayDeps = {
  /** Shared secret Bazantic sends as `Authorization: Bearer <key>`. Unset → routes 404. */
  key?: string;
  /** Public base URL written into the OpenAPI `servers` entry. */
  publicUrl?: string;
  run: (endpoint: string, depth: Depth) => Promise<CheckRun>;
};

/** A Hedera account the endpoint wants to be paid to, in a form the mirror node accepts. */
export type HederaPayTo = { account: string; network: 'mainnet' | 'testnet' | 'previewnet' };

export type GatewayResult = {
  endpoint: string;
  depth: Depth;
  verdict: string;
  checks: Array<{ id: string; outcome: string; summary: string; skippedReason: string | null }>;
  quote: { x402Version: number | null; scheme: string | null; network: string | null; amount: string | null; asset: string | null; payTo: string | null } | null;
  hederaPayTo: HederaPayTo | null;
  /**
   * When the check ran, as Unix seconds — the same unit as a mirror node's
   * `created_timestamp`. A model has no reliable clock, so an account's age is
   * computed against this rather than "now".
   */
  checkedAtUnix: number;
  note: string;
};

/**
 * v2 writes `hedera:testnet`, v1 wrote `hedera-testnet`. Anything else, or a
 * payTo that is not a `shard.realm.num` account id, is not something a Hedera
 * mirror node can look up, so we return null rather than guess.
 */
export function hederaPayToFromQuote(quote: { network?: string; payTo?: string } | null): HederaPayTo | null {
  const net = quote?.network?.toLowerCase().match(/^hedera[:-](mainnet|testnet|previewnet)$/)?.[1];
  const account = quote?.payTo?.trim();
  if (!net || !account || !/^\d+\.\d+\.\d+$/.test(account)) return null;
  return { account, network: net as HederaPayTo['network'] };
}

function digest(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

function requireKey(key: string) {
  const expected = digest(key);
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    // Compare fixed-length digests so neither content nor length leaks through timing.
    if (!presented || !timingSafeEqual(digest(presented), expected)) {
      return res.status(401).json({ error: 'missing or invalid gateway credential' });
    }
    next();
  };
}

export function toGatewayResult(run: CheckRun, depth: Depth): GatewayResult {
  const q = run.quote;
  return {
    endpoint: run.target.endpoint ?? '',
    depth,
    verdict: run.verdict,
    checks: run.checks.map((c) => ({ id: c.id, outcome: c.outcome, summary: c.summary, skippedReason: c.skippedReason ?? null })),
    quote: q
      ? {
          x402Version: q.version ?? null,
          scheme: q.scheme ?? null,
          network: q.network ?? null,
          amount: q.amount ?? null,
          asset: q.asset ?? null,
          payTo: q.payTo ?? null,
        }
      : null,
    hederaPayTo: hederaPayToFromQuote(q),
    checkedAtUnix: Math.floor(Date.parse(run.generatedAt) / 1000) || Math.floor(Date.now() / 1000),
    note:
      'Passive checks only (no payment was made to the endpoint), so SAFE is never returned — the best case is UNKNOWN: alive and quoting correctly, delivery unverified.',
  };
}

export function createGatewayRouter(deps: GatewayDeps): Router {
  const router = express.Router();
  if (!deps.key) {
    router.use((_req, res) => res.status(404).json({ error: 'Bazantic gateway upstream is not enabled on this deployment' }));
    return router;
  }

  router.get('/openapi.json', (req, res) => {
    const base = deps.publicUrl ?? `${req.protocol}://${req.get('host')}`;
    res.json(openApiSpec(base));
  });

  router.use(express.json({ limit: '8kb' }), requireKey(deps.key));

  const handler = (depth: Depth) => async (req: Request, res: Response) => {
    if (Array.isArray(req.body?.endpoints)) {
      return res.status(400).json({ error: 'this gateway checks one endpoint per call: send { "endpoint": "https://..." }' });
    }
    const parsed = parseCheckRequest({ endpoint: req.body?.endpoint, depth });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const run = await deps.run(parsed.request.endpoints[0], depth);
    res.json(toGatewayResult(run, depth));
  };

  router.post('/check', handler('full'));
  router.post('/liveness', handler('liveness'));
  return router;
}

const checkSchema = {
  type: 'object',
  required: ['id', 'outcome', 'summary'],
  properties: {
    id: { type: 'string', description: 'P1 liveness, P2 quote validity, P3 price consistency' },
    outcome: { type: 'string', enum: ['pass', 'fail', 'warn', 'skipped'] },
    summary: { type: 'string' },
    skippedReason: { type: ['string', 'null'] },
  },
};

const resultSchema = {
  type: 'object',
  required: ['endpoint', 'depth', 'verdict', 'checks', 'quote', 'hederaPayTo', 'checkedAtUnix', 'note'],
  properties: {
    endpoint: { type: 'string' },
    depth: { type: 'string', enum: ['full', 'liveness'] },
    verdict: {
      type: 'string',
      enum: ['SAFE', 'CAUTION', 'UNSAFE', 'DEAD', 'UNKNOWN'],
      description:
        'DEAD: did not answer. CAUTION: answered but the payment quote is malformed or inconsistent. UNKNOWN: alive and (for full checks) quoting correctly, but delivery was not verified. SAFE and UNSAFE need a paid delivery check and are never returned here.',
    },
    checks: { type: 'array', items: checkSchema },
    quote: {
      description: 'The x402 payment quote the endpoint returned to an unpaid request, or null if it returned none.',
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            x402Version: { type: ['integer', 'null'] },
            scheme: { type: ['string', 'null'] },
            network: { type: ['string', 'null'], example: 'hedera:testnet' },
            amount: { type: ['string', 'null'], description: 'Atomic units of `asset` (tinybar for HBAR 0.0.0).' },
            asset: { type: ['string', 'null'] },
            payTo: { type: ['string', 'null'] },
          },
        },
      ],
    },
    hederaPayTo: {
      description:
        'Set when the quote asks to be paid to a Hedera account. Look this account up on a Hedera mirror node for the SAME network before paying: whether it exists, is deleted, how old it is, and whether it has received payments.',
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['account', 'network'],
          properties: {
            account: { type: 'string', example: '0.0.10475917' },
            network: { type: 'string', enum: ['mainnet', 'testnet', 'previewnet'] },
          },
        },
      ],
    },
    checkedAtUnix: {
      type: 'integer',
      description: 'When the check ran, in Unix seconds. Compare against a mirror node created_timestamp (seconds.nanoseconds) to get an account age.',
    },
    note: { type: 'string' },
  },
};

const endpointBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['endpoint'],
        additionalProperties: false,
        properties: {
          endpoint: {
            type: 'string',
            format: 'uri',
            description: 'The paid API URL an agent is about to pay. Public http(s) only; private and loopback addresses are refused.',
            example: 'https://testbed-1l2m.onrender.com/good',
          },
        },
      },
    },
  },
};

const errors = {
  '400': { description: 'Invalid endpoint (malformed, non-http, or a private/loopback address).' },
  '401': { description: 'Gateway credential missing or wrong.' },
};

export function openApiSpec(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Preflight',
      version: '1.0.0',
      description:
        "Before an AI agent pays a stranger's x402 API, Preflight checks whether that endpoint is alive and quoting a well-formed payment. Passive checks only: one liveness probe and one unpaid quote request, nothing adversarial.",
    },
    servers: [{ url: baseUrl }],
    components: { securitySchemes: { gatewayKey: { type: 'http', scheme: 'bearer' } } },
    security: [{ gatewayKey: [] }],
    paths: {
      '/gw/check': {
        post: {
          operationId: 'preflightCheckEndpoint',
          summary: 'Full pre-payment check of one x402 endpoint',
          description:
            'Use BEFORE paying an x402 endpoint you have not paid before. Runs P1 liveness (3 probes), P2 quote validity (fetches the unpaid 402 quote and validates it for x402 v1 or v2), and P3 price consistency. Returns a verdict band, per-check results, the structured quote, and — when the quote pays a Hedera account — that account id and network so it can be verified on a mirror node. Takes 1–15 s.',
          requestBody: endpointBody,
          responses: { '200': { description: 'Check completed.', content: { 'application/json': { schema: resultSchema } } }, ...errors },
        },
      },
      '/gw/liveness': {
        post: {
          operationId: 'preflightLivenessCheck',
          summary: 'Cheap liveness-only check of one endpoint',
          description:
            'Use to screen many candidate endpoints cheaply before running the full check on the survivors. Runs P1 only. An endpoint answering 402 counts as alive. Does not inspect the quote, so hederaPayTo is always null.',
          requestBody: endpointBody,
          responses: { '200': { description: 'Check completed.', content: { 'application/json': { schema: resultSchema } } }, ...errors },
        },
      },
    },
  };
}
