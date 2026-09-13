/**
 * Metered pricing for Preflight checks.
 *
 * The price is the work: how many endpoints, and how deep. Not a flat
 * per-request charge.
 *
 *   price = unit(depth) × number of endpoints
 *
 *   depth "liveness"  P1 only                       40,000 tinybar / endpoint
 *   depth "full"      P1 + P2 + P3 (the default)   100,000 tinybar / endpoint
 *
 * ONE PARSER, TWO CALLERS. The x402 middleware prices the request by calling
 * `parseCheckRequest` on the unpaid body, and the handler does the work by
 * calling it again on the paid retry. Because the same pure function reads the
 * same body, the work performed is exactly the work that was priced — a buyer
 * cannot pay for one endpoint and receive ten, and cannot be charged for ten
 * while getting one.
 */

import { forbiddenTargetReason } from '../../../packages/checks/src/target-guard';

/** Tinybar per endpoint, by depth. 1 HBAR = 100,000,000 tinybar. */
export const UNIT_TINYBAR = {
  liveness: 40_000n,
  full: 100_000n,
} as const;

export type Depth = keyof typeof UNIT_TINYBAR;

/**
 * Upper bound on endpoints per request. Keeps a single paid call from turning
 * into a large fan-out against third parties, and bounds the worst-case price.
 */
export const MAX_ENDPOINTS = 10;

export type CheckRequest = { endpoints: string[]; depth: Depth };
export type ParseResult = { ok: true; request: CheckRequest } | { ok: false; error: string };

export function parseCheckRequest(body: unknown): ParseResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const depth: Depth = b.depth === 'liveness' ? 'liveness' : 'full';
  if (b.depth !== undefined && b.depth !== 'liveness' && b.depth !== 'full') {
    return { ok: false, error: `depth must be "liveness" or "full", got ${JSON.stringify(b.depth)}` };
  }

  const raw = Array.isArray(b.endpoints) ? b.endpoints : b.endpoint !== undefined ? [b.endpoint] : [];
  const endpoints = raw.map((e) => String(e ?? '').trim()).filter(Boolean);

  if (endpoints.length === 0) {
    return { ok: false, error: 'body must be { "endpoint": "https://..." } or { "endpoints": ["https://...", ...] }' };
  }
  if (endpoints.length > MAX_ENDPOINTS) {
    return { ok: false, error: `at most ${MAX_ENDPOINTS} endpoints per request, got ${endpoints.length}` };
  }

  // Duplicates would be charged twice for one piece of work.
  const unique = [...new Set(endpoints)];

  for (const e of unique) {
    let url: URL;
    try {
      url = new URL(e);
    } catch {
      return { ok: false, error: `not a valid URL: ${e.slice(0, 80)}` };
    }
    const forbidden = forbiddenTargetReason(url);
    if (forbidden) return { ok: false, error: `${forbidden}: ${e.slice(0, 80)}` };
  }

  return { ok: true, request: { endpoints: unique, depth } };
}

/** Price in tinybar for a valid request. */
export function quoteTinybar(req: CheckRequest): bigint {
  return UNIT_TINYBAR[req.depth] * BigInt(req.endpoints.length);
}

/**
 * Price for the x402 middleware, which must return *something* even for a
 * body it cannot parse. Invalid bodies are normally stopped with a 400 before
 * the paywall (./prevalidate.ts); if one ever got through, it would be quoted
 * at one full unit, the handler would still 400, and on the default
 * authorization flow a failed handler cancels settlement — nothing charged.
 */
export function priceForBody(body: unknown): string {
  const parsed = parseCheckRequest(body);
  return (parsed.ok ? quoteTinybar(parsed.request) : UNIT_TINYBAR.full).toString();
}
