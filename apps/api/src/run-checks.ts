/**
 * The passive check run shared by every paid front door — the Hedera x402
 * route and the Bazantic gateway route. One implementation, so the two can
 * never disagree about what "a full check" means.
 *
 * Group P only. See the abuse boundary in ./server.ts.
 */
import { checkLiveness } from '../../../packages/checks/src/checks/p1-liveness';
import { checkQuote, checkPriceConsistency, type Quote } from '../../../packages/checks/src/checks/p2-quote';
import { buildReport, renderReport } from '../../../packages/checks/src/report';
import type { CheckResult, PreflightReport } from '../../../packages/checks/src/types';
import type { Depth } from './metering';

export type CheckRun = PreflightReport & { rendered: string; quote: Quote | null };

export async function runChecks(endpoint: string, depth: Depth, chain: string): Promise<CheckRun> {
  const checks: CheckResult[] = [];
  checks.push(await checkLiveness(endpoint));
  let quote: Quote | null = null;
  if (depth === 'full') {
    const q = await checkQuote(endpoint);
    quote = q.quote;
    checks.push(q.check);
    // No registration metadata in scope for an ad-hoc URL, so P3 has nothing
    // advertised to compare against and reports why rather than guessing.
    checks.push(checkPriceConsistency(quote, null));
  }
  const report = buildReport({ endpoint, chain }, checks);
  return { ...report, rendered: renderReport(report, { anonymise: false }), quote };
}
