/**
 * Run A1 (replay) against our own testbed.
 *
 * Refuses to run against anything not in OWN_TESTBED_HOSTS — that refusal is
 * the point, and is demonstrated by pointing it at a third party.
 *
 *   npm run a1 -- http://localhost:8402/good http://localhost:8402/bad-replay
 */
import { config } from 'dotenv';
import { checkReplay } from '../checks/a1-replay';
import { NotOurTestbedError } from '../guard';
import type { P4Config } from '../checks/p4-delivery';

config({ path: '../../testbed/.env' });
config({ path: '.env' });

const accountId = process.env.HEDERA_CLIENT_ACCOUNT_ID?.trim();
const privateKey = process.env.HEDERA_CLIENT_PRIVATE_KEY?.trim();
const network = (process.env.HEDERA_NETWORK?.trim() ?? 'hedera:testnet') as `${string}:${string}`;
const asset = process.env.HBAR_ASSET?.trim() ?? '0.0.0';
const maxAmountPerPayment = process.env.MAX_AMOUNT_PER_PAYMENT?.trim() ?? '2000000';

if (!accountId || !privateKey) {
  console.error('Missing HEDERA_CLIENT_ACCOUNT_ID / HEDERA_CLIENT_PRIVATE_KEY.');
  process.exit(1);
}

const endpoints = process.argv.slice(2);
if (endpoints.length === 0) {
  console.error('Usage: npm run a1 -- <endpoint> [endpoint...]');
  process.exit(1);
}

const cfg: P4Config = { accountId, privateKey, network, asset, maxAmountPerPayment };

console.log('A1 replay check  [GROUP A — our own testbed only, see ETHICS.md]');
console.log(`  payer:   ${accountId} on ${network}`);
console.log(`  targets: ${endpoints.length}\n`);

for (const endpoint of endpoints) {
  console.log(`→ ${endpoint}`);
  try {
    const result = await checkReplay(endpoint, cfg);
    const mark = { pass: '✓', fail: '✗', warn: '⚠', skipped: '–' }[result.outcome];
    console.log(`  ${mark} A1  ${result.summary}`);
    console.log(
      `     first: HTTP ${result.evidence.firstStatus}   replay: HTTP ${result.evidence.replayStatus ?? 'n/a'}`,
    );
    if (result.evidence.replayBodyExcerpt) {
      console.log(`     replay body: ${String(result.evidence.replayBodyExcerpt).slice(0, 140)}`);
    }
  } catch (err) {
    if (err instanceof NotOurTestbedError) {
      console.log(`  – A1  SKIPPED — ${err.message}`);
    } else {
      console.log(`  ! A1  ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log();
}
