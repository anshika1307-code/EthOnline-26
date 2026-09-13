/**
 * Payee verification: the half of "is it safe to pay?" that a quote cannot answer.
 *
 * Preflight P2 proves a quote is well-formed. It cannot prove the account the
 * quote pays actually exists, can receive, or has ever been paid by anyone.
 * Only the ledger knows that — so this reads a Hedera mirror node.
 *
 * This module is the REFERENCE for the Bazantic recipe
 * (integrations/bazantic/recipe.json). The recipe runs the same rules through
 * an LLM calling the Preflight and mirror-node gateways; this runs them in
 * code, so the recipe's answers can be checked against a deterministic oracle.
 * Change a rule here and the recipe prompt must change with it.
 *
 * Pure functions over mirror-node JSON. No network.
 */

export type Decision = 'PAY' | 'PAY_WITH_SMALL_CAP' | 'DO_NOT_PAY' | 'CANNOT_VERIFY_PAYEE';

export type HederaNetwork = 'mainnet' | 'testnet' | 'previewnet';

/** The subset of the Preflight gateway response the decision needs. */
export type PreflightInput = {
  endpoint: string;
  verdict: string;
  checks: Array<{ id: string; outcome: string; summary: string }>;
  quote: { network: string | null; amount: string | null; asset: string | null; payTo: string | null } | null;
  hederaPayTo: { account: string; network: HederaNetwork } | null;
};

/** Mirror node GET /api/v1/accounts/{id} body, or null for a 404. */
export type MirrorAccount = {
  account: string;
  deleted: boolean;
  created_timestamp: string | null;
  receiver_sig_required: boolean | null;
  max_automatic_token_associations: number;
  evm_address?: string | null;
} | null;

/** Mirror node GET /api/v1/transactions?account.id=… body. */
export type MirrorTransactions = {
  transactions: Array<{ result: string; transfers?: Array<{ account: string; amount: number }> }>;
  links?: { next: string | null };
};

export type PayeeFacts = {
  account: string;
  network: HederaNetwork;
  exists: boolean;
  deleted: boolean | null;
  receiverSigRequired: boolean | null;
  ageDays: number | null;
  /** Successful transfers that credited this account, within the page read. */
  inboundPayments: number | null;
  /** True when the page was full, so the real count may be higher. */
  historyTruncated: boolean;
  /** For an HTS-token quote: can the account receive that token? null for HBAR. */
  canReceiveToken: boolean | null;
};

export type Assessment = {
  endpoint: string;
  decision: Decision;
  maxPayment: { amount: string; asset: string; network: string } | null;
  preflightVerdict: string;
  payee: PayeeFacts | null;
  reasons: string[];
};

/** Below this age a payee is "new": fine to try, not fine to trust with much. */
export const NEW_ACCOUNT_DAYS = 7;
export const HBAR = '0.0.0';

export function payeeFacts(
  hedera: { account: string; network: HederaNetwork },
  account: MirrorAccount,
  txs: MirrorTransactions | null,
  opts: { now: Date; quoteAsset?: string | null; tokenAssociated?: boolean | null },
): PayeeFacts {
  if (!account) {
    return {
      ...hedera, exists: false, deleted: null, receiverSigRequired: null, ageDays: null,
      inboundPayments: null, historyTruncated: false, canReceiveToken: null,
    };
  }
  const created = account.created_timestamp ? Number(account.created_timestamp.split('.')[0]) * 1000 : null;
  const ageDays = created === null ? null : Math.round(((opts.now.getTime() - created) / 86_400_000) * 10) / 10;

  const inbound = txs
    ? txs.transactions.filter(
        (t) => t.result === 'SUCCESS' && (t.transfers ?? []).some((x) => x.account === hedera.account && x.amount > 0),
      ).length
    : null;

  const isToken = Boolean(opts.quoteAsset && opts.quoteAsset !== HBAR);
  const canReceiveToken = !isToken
    ? null
    : opts.tokenAssociated === true || account.max_automatic_token_associations !== 0;

  return {
    ...hedera,
    exists: true,
    deleted: account.deleted,
    receiverSigRequired: account.receiver_sig_required,
    ageDays,
    inboundPayments: inbound,
    historyTruncated: Boolean(txs?.links?.next),
    canReceiveToken,
  };
}

/**
 * The rules, in order. First match decides.
 *
 * `mirrorNetworks` is which networks the caller can actually read. Looking a
 * testnet account up on a mainnet mirror returns a DIFFERENT account with the
 * same id (0.0.10475917 exists on both, with different keys and balances), so
 * a payee on a network we cannot read is unverifiable — never cross-checked.
 */
export function decide(
  pf: PreflightInput,
  payee: PayeeFacts | null,
  mirrorNetworks: HederaNetwork[],
): Assessment {
  const out = (decision: Decision, reasons: string[], withCap = false): Assessment => ({
    endpoint: pf.endpoint,
    decision,
    maxPayment:
      withCap && pf.quote?.amount && pf.quote.network
        ? { amount: pf.quote.amount, asset: pf.quote.asset ?? HBAR, network: pf.quote.network }
        : null,
    preflightVerdict: pf.verdict,
    payee,
    reasons,
  });
  const failed = pf.checks.filter((c) => c.outcome === 'fail').map((c) => `${c.id}: ${c.summary}`);

  if (pf.verdict === 'DEAD') return out('DO_NOT_PAY', ['endpoint did not answer usefully', ...failed]);
  if (pf.verdict === 'CAUTION' || pf.verdict === 'UNSAFE') {
    return out('DO_NOT_PAY', [`Preflight verdict ${pf.verdict}`, ...failed]);
  }
  if (!pf.quote) return out('DO_NOT_PAY', ['endpoint offers no x402 payment quote, so there is nothing to pay']);

  if (!pf.hederaPayTo) {
    return out('CANNOT_VERIFY_PAYEE', [`quote pays ${pf.quote.payTo} on ${pf.quote.network}, which is not a Hedera account`], true);
  }
  if (!mirrorNetworks.includes(pf.hederaPayTo.network)) {
    return out('CANNOT_VERIFY_PAYEE', [
      `payee is on Hedera ${pf.hederaPayTo.network}, and no ${pf.hederaPayTo.network} mirror node is available — not cross-checking against another network`,
    ], true);
  }
  if (!payee) throw new Error('payee facts are required when the payee network is readable');

  if (!payee.exists) return out('DO_NOT_PAY', [`payee ${payee.account} does not exist on Hedera ${payee.network}`]);
  if (payee.deleted) return out('DO_NOT_PAY', [`payee ${payee.account} is deleted`]);
  if (payee.receiverSigRequired) {
    return out('DO_NOT_PAY', [`payee ${payee.account} requires its own signature to receive, so an x402 transfer cannot settle`]);
  }
  if (payee.canReceiveToken === false) {
    return out('DO_NOT_PAY', [`payee is not associated with token ${pf.quote.asset} and has no automatic association slots`]);
  }

  const cautions: string[] = [];
  if (payee.ageDays !== null && payee.ageDays < NEW_ACCOUNT_DAYS) cautions.push(`payee account is ${payee.ageDays} days old`);
  if (payee.inboundPayments === 0) cautions.push('payee has no successful incoming transfers in its recent history');
  const delivery = 'delivery is unverified (passive checks only)';

  if (cautions.length) return out('PAY_WITH_SMALL_CAP', [...cautions, delivery], true);
  return out('PAY', [`payee exists, can receive, and has ${payee.inboundPayments}${payee.historyTruncated ? '+' : ''} incoming payments`, delivery], true);
}
