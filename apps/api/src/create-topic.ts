/**
 * Create the HCS topic that Preflight writes payment receipts to. Run once.
 *
 *   npx tsx src/create-topic.ts            # dry run
 *   npx tsx src/create-topic.ts --send     # creates the topic (costs a little testnet HBAR)
 *
 * Then set HCS_TOPIC_ID in .env to the printed id.
 *
 * Imports `@hiero-ledger/sdk` directly because `@x402/hedera` does not
 * re-export the topic transactions. That is only safe because apps/api pins
 * the SDK to the exact version `@x402/hedera` depends on, so npm dedupes to a
 * single copy — see `npm ls @hiero-ledger/sdk`. Two copies would break the
 * SDK's internal brand checks at runtime.
 */
import 'dotenv/config';
import { Client, PrivateKey, AccountId, TopicCreateTransaction } from '@hiero-ledger/sdk';

const operatorId = process.env.HCS_OPERATOR_ID?.trim();
const operatorKey = process.env.HCS_OPERATOR_KEY?.trim();

if (!operatorId || !operatorKey) {
  console.error('Set HCS_OPERATOR_ID and HCS_OPERATOR_KEY (ECDSA, 0x-prefixed) in apps/api/.env');
  process.exit(1);
}

const memo = 'preflight.receipt.v1 — paid endpoint safety checks, one message per settled check';

console.log('Create Preflight HCS receipt topic');
console.log(`  network   hedera:testnet`);
console.log(`  operator  ${operatorId}`);
console.log(`  memo      ${memo}`);

if (!process.argv.includes('--send')) {
  console.log('\nDRY RUN — nothing sent. Re-run with --send.');
  process.exit(0);
}

const key = PrivateKey.fromStringECDSA(operatorKey);
const client = Client.forTestnet().setOperator(AccountId.fromString(operatorId), key);

const tx = await new TopicCreateTransaction()
  .setTopicMemo(memo)
  // Only our key may submit, so a receipt on this topic cannot be forged by a third party.
  .setSubmitKey(key.publicKey)
  .execute(client);
const receipt = await tx.getReceipt(client);

console.log(`\n  status    ${receipt.status}`);
console.log(`  topic     ${receipt.topicId}`);
console.log(`  tx        ${tx.transactionId}`);
console.log(`\n  https://hashscan.io/testnet/topic/${receipt.topicId}`);
console.log(`\nAdd to apps/api/.env:\n  HCS_TOPIC_ID=${receipt.topicId}`);
client.close();
