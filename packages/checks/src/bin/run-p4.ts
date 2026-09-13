/**
 * Run P4 (delivery) against one or more endpoints and print the result.
 *
 * Order matters (ETHICS.md §5): test our OWN good/bad-delivery endpoints
 * before pointing this at anything we do not own.
 *
 *   npm run p4 -- http://localhost:8402/good
 *   npm run p4 -- http://localhost:8402/good http://localhost:8402/bad-delivery
 */
import { config } from 'dotenv';
import { checkDelivery, type P4Config } from '../checks/p4-delivery';
import { isOwnTestbed } from '../guard';

config({ path: '../../testbed/.env' });
config({ path: '.env' });

const accountId = process.env.HEDERA_CLIENT_ACCOUNT_ID?.trim();
const privateKey = process.env.HEDERA_CLIENT_PRIVATE_KEY?.trim();
const network = (process.env.HEDERA_NETWORK?.trim() ?? 'hedera:testnet') as `${string}:${string}`;
const asset = process.env.HBAR_ASSET?.trim() ?? '0.0.0';
// Hard cap. 2_000_000 tinybars = 0.02 HBAR — double the testbed price, so a
// mispriced endpoint is refused rather than silently paid.
const maxAmountPerPayment = process.env.MAX_AMOUNT_PER_PAYMENT?.trim() ?? '2000000';

if (!accountId || !privateKey) {
  console.error(
    'Missing HEDERA_CLIENT_ACCOUNT_ID / HEDERA_CLIENT_PRIVATE_KEY.\n' +
      'Set them in testbed/.env (they are already commented there) or packages/checks/.env',
  );
  process.exit(1);
}

const endpoints = process.argv.slice(2);
if (endpoints.length === 0) {
  console.error('Usage: npm run p4 -- <endpoint> [endpoint...]');
  process.exit(1);
}

const cfg: P4Config = { accountId, privateKey, network, asset, maxAmountPerPayment };

console.log(`P4 delivery check`);
console.log(`  payer:   ${accountId} on ${network}`);
console.log(`  cap:     ${maxAmountPerPayment} tinybars (${Number(maxAmountPerPayment) / 1e8} HBAR) per payment`);
console.log(`  targets: ${endpoints.length}\n`);

for (const endpoint of endpoints) {
  const ours = isOwnTestbed(endpoint) ? ' [our testbed]' : ' [third party — passive only]';
  console.log(`→ ${endpoint}${ours}`);
  const result = await checkDelivery(endpoint, cfg);

  const mark = { pass: '✓', fail: '✗', warn: '⚠', skipped: '–' }[result.outcome];
  console.log(`  ${mark} P4  ${result.summary}`);

  const s = result.evidence.settlement as Record<string, unknown> | null;
  if (s) {
    const tx = s.transaction ?? s.txHash ?? s.transactionId;
    if (tx) console.log(`     tx: ${tx}`);
    if (s.network) console.log(`     network: ${s.network}`);
  }
  console.log(`     evidence: HTTP ${result.evidence.status}, ${result.evidence.bodyBytes} bytes, ${result.evidence.elapsedMs}ms`);
  if (result.evidence.bodyExcerpt) {
    console.log(`     body: ${String(result.evidence.bodyExcerpt).slice(0, 160)}`);
  }
  console.log();
}
