/**
 * Free scan endpoint behind the dashboard form — front door #1 from brief v3
 * §3: "scan an endpoint, see the report".
 *
 * ABUSE BOUNDARY: this is an unauthenticated endpoint that fetches a URL the
 * caller supplies, so it is an attack proxy unless fenced. It runs **Group P
 * (passive) only** — one liveness probe and one unpaid quote request, exactly
 * what an ordinary customer does. Group A is not reachable here and must never
 * be added. See ETHICS.md §1 rule 2.
 *
 * The paid version of the same thing lives in apps/api, gated with x402.
 */
import { NextResponse } from 'next/server';
import { checkLiveness } from '../../../../packages/checks/src/checks/p1-liveness';
import { checkQuote, checkPriceConsistency } from '../../../../packages/checks/src/checks/p2-quote';
import { buildReport, renderReport } from '../../../../packages/checks/src/report';
import type { CheckResult } from '../../../../packages/checks/src/types';
import { forbiddenTargetReason } from '../../../../packages/checks/src/target-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'expected JSON body { endpoint }' }, { status: 400 });
  }

  const endpoint = (body.endpoint ?? '').trim();
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return NextResponse.json({ error: 'not a valid URL' }, { status: 400 });
  }

  const forbidden = forbiddenTargetReason(url);
  if (forbidden) return NextResponse.json({ error: forbidden }, { status: 400 });

  const checks: CheckResult[] = [];
  checks.push(await checkLiveness(endpoint, { attempts: 2 }));
  const { check: p2, quote } = await checkQuote(endpoint);
  checks.push(p2);
  checks.push(checkPriceConsistency(quote, null));

  const report = buildReport({ endpoint, chain: 'ad-hoc' }, checks);

  return NextResponse.json({
    ...report,
    rendered: renderReport(report, { anonymise: false }),
    note: 'Passive checks only. SAFE is never returned here — that needs a completed payment.',
  });
}
