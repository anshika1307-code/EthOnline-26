/**
 * Reference run for the Bazantic recipe — the QA oracle.
 *
 * Does in code, against the real services, exactly what the recipe asks the
 * model to do: Preflight check → (if Hedera payee) mirror-node lookups on the
 * payee's own network → decision. Its output is what the recipe's output
 * should agree with, case by case (see TEST_PLAN.md).
 *
 *   # through the deployed Preflight gateway route (what Bazantic calls)
 *   PREFLIGHT_GW_URL=https://ethonline-26.onrender.com BAZANTIC_UPSTREAM_KEY=... \
 *     npx tsx integrations/bazantic/reference-run.ts
 *
 *   # or run the checks in-process (no key needed, e.g. against a local testbed)
 *   npx tsx integrations/bazantic/reference-run.ts --direct --testbed http://localhost:8402
 *
 * Mirror reads are free public GETs here. Through Bazantic they are paid calls.
 */
import { runChecks } from '../../apps/api/src/run-checks';
import { toGatewayResult, type GatewayResult } from '../../apps/api/src/gateway';
import {
  decide,
  payeeFacts,
  type HederaNetwork,
  type MirrorAccount,
  type MirrorTransactions,
} from '../../packages/checks/src/payee';

const MIRROR: Record<HederaNetwork, string> = {
  mainnet: 'https://mainnet-public.mirrornode.hedera.com',
  testnet: 'https://testnet.mirrornode.hedera.com',
  previewnet: 'https://previewnet.mirrornode.hedera.com',
};

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const direct = args.includes('--direct');
const testbed = flag('--testbed') ?? 'https://testbed-1l2m.onrender.com';
/** Which mirror networks the recipe has bound. Default matches recipe.json. */
const mirrorNetworks = (flag('--mirrors') ?? 'testnet,mainnet').split(',') as HederaNetwork[];

const VALUE_FLAGS = new Set(['--testbed', '--mirrors']);
const cases = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1]));
const endpoints = cases.length
  ? cases
  : [`${testbed}/good`, `${testbed}/bad-payee`, `${testbed}/does-not-exist`];

async function preflight(endpoint: string): Promise<GatewayResult> {
  if (direct) return toGatewayResult(await runChecks(endpoint, 'full', 'reference-run'), 'full');
  const base = process.env.PREFLIGHT_GW_URL;
  const key = process.env.BAZANTIC_UPSTREAM_KEY;
  if (!base || !key) throw new Error('set PREFLIGHT_GW_URL and BAZANTIC_UPSTREAM_KEY, or pass --direct');
  const r = await fetch(`${base}/gw/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ endpoint }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`Preflight gateway ${r.status}: ${await r.text()}`);
  return (await r.json()) as GatewayResult;
}

async function mirror<T>(network: HederaNetwork, path: string): Promise<T | null> {
  const r = await fetch(MIRROR[network] + path, { signal: AbortSignal.timeout(20_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`mirror ${network} ${path} → ${r.status}`);
  return (await r.json()) as T;
}

async function assess(endpoint: string) {
  const calls: string[] = [`preflightCheckEndpoint ${endpoint}`];
  const pf = await preflight(endpoint);

  let payee = null;
  const h = pf.hederaPayTo;
  const needsMirror =
    pf.verdict === 'UNKNOWN' && pf.quote && h && mirrorNetworks.includes(h.network);
  if (needsMirror && h) {
    const account = await mirror<MirrorAccount>(h.network, `/api/v1/accounts/${h.account}?transactions=false`);
    calls.push(`[${h.network} mirror] getAccount ${h.account}`);
    let txs: MirrorTransactions | null = null;
    let tokenAssociated: boolean | null = null;
    if (account) {
      txs = await mirror<MirrorTransactions>(
        h.network,
        `/api/v1/transactions?account.id=${h.account}&transactiontype=CRYPTOTRANSFER&result=success&limit=25&order=desc`,
      );
      calls.push(`[${h.network} mirror] getTransactions account.id=${h.account} transactiontype=CRYPTOTRANSFER result=success limit=25`);
      if (pf.quote?.asset && pf.quote.asset !== '0.0.0') {
        const t = await mirror<{ tokens: unknown[] }>(h.network, `/api/v1/accounts/${h.account}/tokens?token.id=${pf.quote.asset}`);
        tokenAssociated = Boolean(t?.tokens.length);
        calls.push(`[${h.network} mirror] getTokensByAccountId ${h.account} token.id=${pf.quote.asset}`);
      }
    }
    payee = payeeFacts(h, account, txs, { now: new Date(pf.checkedAtUnix * 1000), quoteAsset: pf.quote?.asset, tokenAssociated });
  }

  const a = decide(pf, payee, mirrorNetworks);
  return { ...a, checks: pf.checks.map((c) => `${c.id} ${c.outcome}: ${c.summary}`), toolCalls: calls };
}

async function main() {
  for (const e of endpoints) {
    try {
      console.log(JSON.stringify(await assess(e), null, 2));
    } catch (err) {
      console.log(JSON.stringify({ endpoint: e, error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

main();
