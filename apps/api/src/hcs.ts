/**
 * Verifiable payment audit trail on HCS.
 *
 * Every settled Preflight check writes one compact receipt to an HCS topic,
 * linking what was checked and what we concluded to the on-chain settlement
 * that paid for it. Anyone can read the topic from the mirror node without an
 * account, and only our submit key can write to it, so a receipt cannot be
 * forged by a third party.
 *
 * Optional by design: if HCS is not configured, checks still run and payments
 * still settle. A failed receipt write is logged and never breaks a paid
 * request — the buyer already paid, so they get their report regardless.
 */
import { Client, PrivateKey, AccountId, TopicId, TopicMessageSubmitTransaction } from '@hiero-ledger/sdk';

export type Receipt = {
  type: 'preflight.receipt.v1';
  checked: string;
  verdict: string;
  checks: Record<string, string>;
  /** What was metered: depth, endpoint count, per-unit and total tinybar. */
  meter?: { depth: string; endpoints: number; unitTinybar: string; amountTinybar: string };
  payment: {
    payer: string | null;
    amount: string | null;
    asset: string | null;
    payTo: string | null;
    network: string;
    settlement: string;
  };
  at: string;
};

/** HCS caps a message at 1024 bytes before chunking; stay well inside it. */
const MAX_BYTES = 1000;

let client: Client | null = null;
let topic: TopicId | null = null;

export function hcsConfigured(): boolean {
  return Boolean(process.env.HCS_TOPIC_ID && process.env.HCS_OPERATOR_ID && process.env.HCS_OPERATOR_KEY);
}

function getClient(): { client: Client; topic: TopicId } {
  if (!client || !topic) {
    const key = PrivateKey.fromStringECDSA(process.env.HCS_OPERATOR_KEY!.trim());
    client = Client.forTestnet().setOperator(AccountId.fromString(process.env.HCS_OPERATOR_ID!.trim()), key);
    topic = TopicId.fromString(process.env.HCS_TOPIC_ID!.trim());
  }
  return { client, topic };
}

/** Shrinks a receipt until it fits one HCS message, dropping the least important detail first. */
export function encodeReceipt(receipt: Receipt): string {
  let body = JSON.stringify(receipt);
  if (Buffer.byteLength(body) <= MAX_BYTES) return body;

  // Long URLs are the usual culprit. Keep the host and truncate the rest.
  const trimmed: Receipt = { ...receipt, checked: receipt.checked.slice(0, 160) };
  body = JSON.stringify(trimmed);
  if (Buffer.byteLength(body) <= MAX_BYTES) return body;

  // Still too big (a batch of long URLs): keep the payment and meter, which are
  // what make the receipt verifiable, and cut `checked` to fit. Slicing the
  // serialised JSON instead would write an unparseable message.
  const minimal: Receipt = { ...trimmed, checks: {} };
  const overflow = Buffer.byteLength(JSON.stringify({ ...minimal, checked: '' })) - MAX_BYTES;
  const room = Math.max(0, -overflow - 3);
  minimal.checked = trimmed.checked.slice(0, room) + (room < trimmed.checked.length ? '...' : '');
  minimal.verdict = minimal.verdict.slice(0, 120);
  return JSON.stringify(minimal);
}

export async function submitReceipt(receipt: Receipt): Promise<{ sequence: string; txId: string } | null> {
  if (!hcsConfigured()) return null;
  const { client, topic } = getClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topic)
    .setMessage(encodeReceipt(receipt))
    .execute(client);
  const r = await tx.getReceipt(client);
  return { sequence: r.topicSequenceNumber?.toString() ?? '?', txId: tx.transactionId?.toString() ?? '?' };
}
