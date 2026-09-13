/**
 * An autonomous buyer agent that asks Preflight before it pays a stranger.
 *
 * This is the loop the Hedera track describes: "show an agent discovering it
 * and paying for it without an API key or a subscription in sight."
 *
 *   1. DISCOVER  read Preflight's ERC-8004 registration (agent #119) off the
 *                Hedera testnet registry and find its x402 service
 *   2. PAY       buy a safety check over x402, settled through Blocky402
 *   3. DECIDE    use the verdict to decide whether to pay the target at all
 *   4. AUDIT     point at the HCS receipt that records the check it paid for
 *
 * No API key, no account with Preflight, no subscription — just an identity
 * on-chain and a payment per call.
 *
 *   npx tsx src/bin/buyer-agent.ts <target-url>
 *
 * Until Preflight's API is publicly hosted, agent #119's registration has no
 * x402 service (by design — we will not register an unreachable URL). For local
 * development only, --preflight-url substitutes the host; the output says so
 * loudly, because a discovery demo that quietly skips discovery is not one.
 */
import { config } from 'dotenv';
import { pathToFileURL } from 'node:url';
import { createPublicClient, http, parseAbi, type Chain } from 'viem';
import { createPayingFetch } from '../checks/p4-delivery';

config({ path: '../../testbed/.env' });

const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;
const PREFLIGHT_AGENT_ID = 119n;

const hederaTestnet: Chain = {
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hashio.io/api'] } },
};

type Check = { id: string; outcome: string; summary: string };

/**
 * The buyer's own budget rule.
 *
 * Decided from the EVIDENCE, not the verdict band alone. `UNKNOWN` covers both
 * "alive and quoting correctly, delivery unverified" and "refused us and
 * offered no quote" — and the first version of this function said "will pay,
 * correctly quoting" about an endpoint returning 403 with no quote at all.
 * A reason string must never assert something the checks did not observe.
 */
export function decide(verdict: string, checks: Check[]): { pay: boolean; why: string } {
  const outcome = (id: string) => checks.find((c) => c.id === id)?.outcome;

  if (verdict === 'DEAD') return { pay: false, why: 'the endpoint does not answer; paying it would buy nothing' };
  if (verdict === 'UNSAFE') return { pay: false, why: 'evidence of paid-but-denied or replayable payments' };
  if (verdict === 'CAUTION') return { pay: false, why: 'quote or pricing problems — not worth the risk' };

  // Nothing to pay without a valid quote, whatever the band says.
  if (outcome('P2') !== 'pass') {
    const refused = outcome('P1') === 'warn';
    return {
      pay: false,
      why: refused
        ? 'the endpoint refused our probe and offered no payment quote — there is nothing to pay'
        : 'no valid x402 payment quote was offered — there is nothing to pay',
    };
  }

  if (verdict === 'SAFE') return { pay: true, why: 'a payment was completed and delivery verified' };
  if (verdict === 'UNKNOWN' && outcome('P1') === 'pass') {
    return { pay: true, why: 'alive and quoting correctly, but delivery unverified — proceed under a small cap' };
  }
  return { pay: false, why: `insufficient evidence (${verdict}) — refusing by default` };
}

const say = (s = '') => console.log(s);

async function discoverPreflight(): Promise<{ endpoint: string | null; name: string; x402Support: boolean }> {
  const client = createPublicClient({ chain: hederaTestnet, transport: http() });
  const uri = (await client.readContract({
    address: REGISTRY,
    abi: parseAbi(['function tokenURI(uint256) view returns (string)']),
    functionName: 'tokenURI',
    args: [PREFLIGHT_AGENT_ID],
  })) as string;

  const comma = uri.indexOf(',');
  const doc = JSON.parse(Buffer.from(uri.slice(comma + 1), 'base64').toString('utf8'));
  const x402 = (doc.services ?? []).find(
    (s: { name?: string; endpoint?: string }) => String(s.name).toLowerCase() === 'x402' && /^https?:\/\//.test(String(s.endpoint)),
  );
  return { endpoint: x402?.endpoint ?? null, name: doc.name, x402Support: Boolean(doc.x402Support) };
}

async function main() {
  const target = process.argv[2];
  const overrideIdx = process.argv.indexOf('--preflight-url');
  const override = overrideIdx >= 0 ? process.argv[overrideIdx + 1] : undefined;

  if (!target || target.startsWith('--')) {
    console.error('Usage: npx tsx src/bin/buyer-agent.ts <target-url> [--preflight-url http://localhost:8403]');
    process.exit(1);
  }

  say(`Buyer agent wants to pay: ${target}`);
  say(`Before paying a stranger, it asks Preflight.\n`);

  // ── 1. DISCOVER ─────────────────────────────────────────────────────────
  say('1. DISCOVER  reading ERC-8004 registry on Hedera testnet');
  const found = await discoverPreflight();
  say(`   agent #${PREFLIGHT_AGENT_ID} → "${found.name}"  x402Support=${found.x402Support}`);

  let checkUrl: string;
  if (found.endpoint) {
    checkUrl = found.endpoint;
    say(`   x402 service discovered on-chain: ${checkUrl}`);
  } else if (override) {
    checkUrl = `${override.replace(/\/$/, '')}/check`;
    say(`   ⚠ agent #${PREFLIGHT_AGENT_ID} declares no x402 service yet (API not publicly hosted).`);
    say(`   ⚠ LOCAL DEV OVERRIDE — using ${checkUrl}. In production this URL is read from the`);
    say(`     registration above; run scripts/register-agent.ts --update after deploying.`);
  } else {
    say(`   ✗ agent #${PREFLIGHT_AGENT_ID} declares no x402 service. Nothing to pay, so nothing to ask.`);
    say(`     (Deploy apps/api and update the registration, or pass --preflight-url for local dev.)`);
    process.exit(2);
  }

  // ── 2. PAY ──────────────────────────────────────────────────────────────
  say('\n2. PAY       buying a safety check over x402 — no API key, no account, no subscription');
  const { fetch: pay, quote } = createPayingFetch({
    accountId: process.env.HEDERA_CLIENT_ACCOUNT_ID!,
    privateKey: process.env.HEDERA_CLIENT_PRIVATE_KEY!,
    network: 'hedera:testnet',
    asset: '0.0.0',
    // The buyer will not spend more than this on a single check, whatever the quote says.
    maxAmountPerPayment: '200000',
  });

  const res = await pay(checkUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: target }),
  });
  if (!res.ok) {
    say(`   ✗ check failed: HTTP ${res.status}`);
    process.exit(3);
  }
  const report = (await res.json()) as {
    verdict: string;
    checks?: Array<{ id: string; outcome: string; summary: string }>;
  };
  const settle = res.headers.get('PAYMENT-RESPONSE');
  const settlement = settle ? JSON.parse(Buffer.from(settle, 'base64').toString('utf8')).transaction : null;
  say(`   paid ${quote.amount} tinybar to ${quote.payTo}`);
  say(`   settlement ${settlement}`);

  // ── 3. DECIDE ───────────────────────────────────────────────────────────
  say(`\n3. DECIDE    Preflight says ${report.verdict}`);
  for (const c of report.checks ?? []) {
    if (c.outcome === 'skipped') continue;
    const mark = { pass: '✓', fail: '✗', warn: '⚠' }[c.outcome as 'pass' | 'fail' | 'warn'] ?? '·';
    say(`     ${mark} ${c.id}  ${c.summary}`);
  }
  const decision = decide(report.verdict, report.checks ?? []);
  say(`\n   → ${decision.pay ? 'WILL PAY' : 'WILL NOT PAY'} the target: ${decision.why}`);

  // ── 4. AUDIT ────────────────────────────────────────────────────────────
  const base = checkUrl.replace(/\/check$/, '');
  const receipts = (await fetch(`${base}/receipts`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { topic?: string; explorer?: string } | null;
  if (receipts?.topic) {
    say(`\n4. AUDIT     this check is recorded on HCS topic ${receipts.topic}`);
    say(`   ${receipts.explorer}`);
  }
}

// Only run when invoked as a script, so decide() can be imported by tests
// without the agent trying to read argv and exiting.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
