# Preflight on Hedera, a plain-English walkthrough

*For the Hedera judging team. Every claim below links to real code, a real
transaction, or a real receipt, nothing here is a mockup.*

## The one-sentence version

**Every safety check Preflight sells is paid for in real HBAR on Hedera, and
every completed check leaves a permanent, tamper-proof receipt on Hedera**,
so Hedera isn't a bolt-on integration here, it's the actual foundation the
product's money and trust both run through.

## Why Hedera, in the story of this project

Preflight exists to answer one question for an AI agent: *"should I pay this
stranger's API?"* To answer that question honestly, Preflight has to **also**
be something an agent pays, otherwise it's just another free tool nobody
tests against real money. Hedera is where that payment actually happens:
fast, cheap enough that a $0.001 payment makes sense, and it already has a
proper micropayments standard (x402) working on it through a partner called
**Blocky402**.

## The four-step loop, and where Hedera shows up in each step

```
1. DISCOVER   an AI agent looks up Preflight's own on-chain identity
2. PAY        it pays a few cents in HBAR for a safety check
3. DECIDE     it reads the verdict and decides whether to trust the target
4. AUDIT      the whole check gets written to a public, unforgeable log
```

You can run this exact loop yourself right now:

```bash
cd packages/checks && npx tsx src/bin/buyer-agent.ts https://testbed-1l2m.onrender.com/good
```

### Step 1. Discover: Preflight has its own on-chain ID on Hedera

Preflight isn't just *checking* other agents' on-chain identities, it *has
one itself*, registered on the same Hedera testnet it operates on. It's
**agent #119** in the ERC-8004 registry (the emerging standard for on-chain
agent identity), and its full registration record lives entirely on-chain,
no external server required to read it.

- [The registration transaction](https://hashscan.io/testnet/transaction/0xe10a31b584a0cf2dbfacd71b21482359416c7bba183d63b19083a4621882f99c)
- [The transaction that pointed it at our live paid API](https://hashscan.io/testnet/transaction/0x2610b4227e4767ba8963a7320ded2587ed6556ce0c6e6e2188b5fbc293455327)
- Raw evidence: [`data/agent-registration/`](../../data/agent-registration/)

We didn't special-case ourselves, either, before we pointed the entry at a
live API, our own scanner correctly rated our own agent "no working
endpoint," same as it would for anyone else. Only after we actually shipped
a live, paid service did it flip to "confirmed working."

### Step 2. Pay: a real x402 payment settling on Hedera testnet

An agent that wants a Preflight check sends a request. Preflight replies
with **HTTP 402 "Payment Required"**, an actual web standard for "pay me
first", quoting a price in tinybars (Hedera's smallest HBAR unit). The
caller signs a payment, Preflight forwards it to the Blocky402 facilitator,
which settles it on Hedera testnet, and only then does Preflight hand back
the safety report.

This is metered, not a flat fee, a deeper check costs more, in proportion
to how many endpoints get checked, and we tested that the pricing can't be
gamed by paying for a small check and reusing the signature for a bigger one
(it gets rejected with "no matching payment requirements").

Code: [`apps/api/src/server.ts`](../../apps/api/src/server.ts),
[`apps/api/src/metering.ts`](../../apps/api/src/metering.ts)

### Step 3. Decide: a real buyer agent, not a script pretending to be one

`packages/checks/src/bin/buyer-agent.ts` is a small agent that reads
Preflight's own registry entry, finds the paid service inside it, pays for a
check, and then makes an actual pay/don't-pay decision based only on what the
check reported, it's tested specifically so it can never claim something
the check didn't actually observe.

### Step 4. Audit: a receipt on Hedera Consensus Service (HCS) nobody can fake

This is the part we're proudest of. Every time a check gets paid for and
completed, Preflight writes a small receipt to a Hedera topic, a kind of
public bulletin board, recording what was checked, what the verdict was,
and which payment paid for it.

- **Anyone can read it**, with no account needed:
  [`0.0.10519901` on HashScan](https://hashscan.io/testnet/topic/0.0.10519901)
- **Only Preflight can write to it.** The topic has a submit key, so nobody
  can forge a fake "Preflight said this was SAFE" entry.
- **The receipt only gets written after the money has actually moved.** So a
  receipt on that log is proof a real payment happened, not just a promise.
- If Hedera Consensus Service isn't configured, checks and payments still
  work fine, the receipt is a bonus layer of trust, not a single point of
  failure. Code: [`apps/api/src/hcs.ts`](../../apps/api/src/hcs.ts)

## Giving something back: a real pull request to Hedera's own tooling

While building this, we hit real friction with Hedera's developer tools,
logged live, with exact error messages, as it happened, in
[`HEDERA_FEEDBACK.md`](../../HEDERA_FEEDBACK.md). The sharpest one: Hedera's
own example documentation told developers to use an old payment header name
that the current payment library no longer reads. It's a *silent* bug, our
test server that was supposed to demonstrate a security flaw quietly stopped
demonstrating it, because the header it was checking for was never sent. We
only caught it because two of our own checks contradicted each other.

We turned that into a real, filed pull request against Hedera's own
open-source tooling repo, fixing the documentation and explaining the split:
**[hedera-dev/hedera-harness#78](https://github.com/hedera-dev/hedera-harness/pull/78)**
, patch and write-up also included directly in this repo at
[`data/harness-pr/`](../../data/harness-pr/).

## What this satisfies

- **AI & Agentic Payments on Hedera**, a live x402-gated service on Hedera
  testnet, settled through Blocky402, consumed end-to-end by a real agent
  that discovers it, pays for it, and decides based on the result. On-chain
  agent identity (ERC-8004) and a verifiable payment audit trail (HCS) are
  both explicitly called out as bonus credit in the track, we have both.
- **Improve the Hedera Harness**, a real, filed pull request fixing a
  documented bug that would have misled every other builder on this track.

## Everything above, as raw evidence

| What | Where |
|---|---|
| Paid API, live | https://ethonline-26.onrender.com, try `GET /pricing` or `GET /receipts` |
| Test services (good / bad-replay / bad-delivery) | https://testbed-1l2m.onrender.com |
| On-chain agent identity | ERC-8004 agent **#119**, registry `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Payment receipts | HCS topic [`0.0.10519901`](https://hashscan.io/testnet/topic/0.0.10519901) |
| Harness contribution | [hedera-dev/hedera-harness#78](https://github.com/hedera-dev/hedera-harness/pull/78) |
| Friction log, written live | [`HEDERA_FEEDBACK.md`](../../HEDERA_FEEDBACK.md) |
| Full technical write-up | [`README.md`](../../README.md) → "Sponsor technology" |
