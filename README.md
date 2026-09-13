# Preflight

> Every pilot runs a preflight check. Your agent should too.

Soon, AI agents will pay other AI agents for small jobs, a few cents for one
API call, no human, no signup. This is already happening; it's called
**x402**. The problem: an agent about to hand a stranger money has no way to
check first whether that stranger is even alive, honestly priced, or will
deliver anything at all. **Preflight is that check.**

ETHOnline 2026 · Start Fresh track · solo · **[read the plain-English version →](./docs/simple/)**

## Live

| | |
|---|---|
| Dashboard + free passive scan | https://eth-online-26.vercel.app |
| Paid API (x402 on Hedera testnet, via Blocky402) | https://ethonline-26.onrender.com, `GET /pricing`, `GET /receipts`, `POST /check` |
| Testbed (our own endpoints, the only thing we ever attack) | https://testbed-1l2m.onrender.com |
| Our own on-chain identity | ERC-8004 agent **#119** on Hedera testnet |
| Payment receipts, public and unforgeable | HCS topic [`0.0.10519901`](https://hashscan.io/testnet/topic/0.0.10519901) |

Nothing below is hard-coded. Run this and watch a real agent look itself up
on-chain, pay for a check, read the verdict, and decide whether to pay the
target:

```bash
cd packages/checks && npx tsx src/bin/buyer-agent.ts https://testbed-1l2m.onrender.com/good
```

---

## The problem, in numbers

A July 2026 study of 15 x402 payment providers (60,000+ sellers, 360,000+
buyers) found rule violations in **every single one**: free shopping, stolen
assets, denied service ([arXiv:2607.19545](https://arxiv.org/abs/2607.19545)).
A separate study demonstrated five working attacks that end with the buyer
either unpaid-for or paid-but-denied
([arXiv:2605.11781](https://arxiv.org/abs/2605.11781)). And of the first
10,000 agents registered under the emerging on-chain identity standard
(ERC-8004), only 67 even expose a service you could contact
([arXiv:2606.12128](https://arxiv.org/abs/2606.12128)).

Agents are being asked to pay strangers with no way to check first, and the
underlying vocabulary for *why* (discovery → authorization → execution →
accounting each carry their own risk) comes from
[SoK: Blockchain Agent-to-Agent Payments](https://arxiv.org/abs/2604.03733).
One paper even names our exact gap directly: a server can act before payment
is confirmed ([A402](https://arxiv.org/abs/2603.01179)). Their fix needs new
hardware and a protocol change; we took the diagnosis, not the cure, and
built something that catches it today instead.

## Our solution

**Preflight is a check you run before you pay, not a score you trust
instead.** Point it at an endpoint and it actually contacts it, the same
way a paying customer would, then tells you in plain language whether it's
alive, whether its price quote is well-formed, and, most importantly,
whether paying it actually gets you something back. No made-up trust
number: just evidence, timestamped, and reproducible by anyone from the raw
data in this repo.

It does this from both sides of the transaction. As a **buyer**, it makes
one real payment to a target and confirms delivery before calling anything
safe. As a **seller**, it sells that same check over x402 on Hedera, so an
agent can pay a few cents for a safety check the same way it would pay for
anything else, meaning Preflight has to trust its own medicine, not just
preach it.

## What already exists, and the gap it leaves

A few tools (QuickNode's Explorer, Assay Labs, Origin DAO) read on-chain
registry data and compute a reputation score from it. **None of them
actually contacts the endpoint.** Sumsub's KYA checks compliance identity,
not whether the thing behind it works. Preflight is the one piece that
actually knocks on the door. Full comparison: [`PRIOR_ART.md`](./PRIOR_ART.md).

## What we found when we checked every agent

We scanned the **entire** ERC-8004 registry on Ethereum Sepolia, all
10,249 registered agents, not a sample, on 12 Sep 2026.

| | Agents | Share |
|---|---|---|
| Registered | **10,249** | 100% |
| List a working web address | **85** | 0.83% |
| Actually answer when contacted | **37** | 0.36% |
| Correctly set up to accept payment | **5** | 0.05% |

**Five agents out of ten thousand are ready to be paid.** And even those
five don't all speak the same payment protocol. An agent built for the
newer version can't pay four of the five, and gets no helpful error saying
why (the older version puts the price in the response body and calls it
`maxAmountRequired`; the newer one puts it in a header and calls it
`amount`). We hit this ourselves twice, on both sides: once it silently
disabled a bug we'd deliberately built into our own test service (which
turned into a [Hedera Harness pull request](./data/harness-pr/)), and once
our own checker wrongly called four working services "broken." Full story:
[`METHODOLOGY.md`](./METHODOLOGY.md).

**The other 10,164 agents**, roughly: three quarters (7,707) registered and
declared they offer *nothing*. About 1,541 couldn't be read at all, mostly
because public file-hosting gateways (IPFS) refuse this kind of automated
traffic, not because the agents are broken. The rest are placeholders,
empty registrations, or entries with no working web address.

**Ownership is concentrated.** 42 distinct owners sit behind the 85 agents
with a real endpoint, and the **top ten hold 61%** of them. One wallet alone
owns 58% of *every* agent ever registered.

**A caveat we won't bury:** no stranger's endpoint can ever be marked
`SAFE` here, because `SAFE` requires us to have actually completed a real
payment to it and confirmed delivery, and we only ever spend real money
against our own test services, never a stranger's. That's a direct
consequence of the ethics rule below, not an oversight.

## The rule we hold ourselves to

**We never attack a service we don't own.** Trying to replay a payment or
trick a service into double-serving is a form of unauthorized testing, even
with good intentions, academic papers get to do this under a formal
disclosure agreement, and that permission doesn't transfer to us. So:

1. Against anyone else's live service: **passive checks only**, one
   request, sensible timeouts, nothing adversarial.
2. The aggressive checks (replay attempts, etc.) run **only against our own
   test services.**
3. Every request identifies itself by name, with a link back to this repo.
4. If an endpoint asks us to back off, we back off.
5. Every method is published so results can be checked and challenged.
6. We report facts ("paid, got HTTP 500, no content"), never accusations.
7. Strangers are anonymized in the demo and dataset.

This isn't just a promise in a document, **it's enforced in the code.**
Every aggressive check calls a guard function first that refuses to run
against anything not on our own pre-approved list, and there's an automated
test proving a stranger's address gets refused. The paid API can't run
these checks *at any price*. Full detail: [`ETHICS.md`](./ETHICS.md).

## What Preflight actually checks

**Safe against anyone, passive, one request, no attacks:**

| | Check | Catches |
|---|---|---|
| P1 | Is it alive? | Declared but dead, checked 3 times, so "dead once" ≠ "actually dead" |
| P2 | Is the price request well-formed? | A broken or missing payment quote |
| P3 | Does the price match what's advertised? | Quoted price ≠ advertised price |
| P4 | **Do you get anything back?** | Paid, got nothing, the failure this whole project is about |
| P5 | Is the ecosystem dependent on one provider? | One domain quietly dominating discovery |

**Only against our own test services, deliberately adversarial:**

| | Check | Catches |
|---|---|---|
| A1 | Can a payment be reused? | Same proof accepted twice → free service |
| A2–A4 | Idempotency, settlement timing, allowance scope | Not built, out of scope for this event |

Verdicts are plain language, not a score: **SAFE / CAUTION / UNSAFE / DEAD /
UNKNOWN.** We deliberately didn't build a 0–100 number, a rival already
ships one, and we'd rather report evidence than an opinion. `SAFE` requires
a **completed, confirmed payment**, an endpoint that merely answers a `GET`
is `UNKNOWN`, not proven safe to pay.

## How the pieces fit together

```
                    ERC-8004 IdentityRegistry (Sepolia)
                    0x8004A818BFB912233c491871b3d84c89A494BD9e
                                  │  tokenURI / ownerOf
                                  ▼
  packages/registry ─ scan ─▶ data/scan-runs/*.json
                                  │
                                  ▼
  packages/checks ── P1 P2 P3 P5 ─▶ data/liveness-runs/, data/reports/
        │  P4, A1 (payments)                    │
        │                                       ▼
        ▼                                  src/app  ── dashboard
  testbed/  good · bad-replay · bad-delivery
        ▲                                  apps/api ── Preflight sold per call
        │                                       │
        └────── x402 / Hedera testnet ──────────┘
                        │
                 Blocky402 facilitator
                 api.testnet.blocky402.com
```

## How the payment actually works

Preflight both **sells** checks and **buys** them, over the same protocol.

**Selling** (`apps/api`): an unpaid `POST /check` gets back `HTTP 402` with
a price quote. The caller signs a payment and retries; we forward it to
Blocky402 to settle on Hedera, then hand back the report along with the
settlement receipt.

**Buying** (`packages/checks` P4): the delivery check makes one real
payment to a target and confirms the resource actually comes back, with a
hard spend cap enforced *before* anything is signed.

**Pricing is metered, not flat**: `price = unit(depth) × number of
endpoints checked`, capped at 10 per request. We tested that you can't pay
for a 1-endpoint check and reuse the signature for a 5-endpoint one, it
gets rejected with a price mismatch, not a signature error, proving the
check is real. `GET /pricing` returns the exact formula.

## Run it yourself

```bash
npm install
node scripts/verify-claims.mjs           # re-derive every number above from data/
cp .env.local.example .env.local         # set RPC_URL for Sepolia

npm run fetch-agents                     # scan the registry (~6 min for all 10,249)
cd packages/checks && npm install && npm run p1   # liveness over every declared endpoint
npm run report                           # render Preflight reports
cd ../.. && npm run dev                  # dashboard at http://localhost:3000
```

**To make real payments**, you'll need two funded Hedera testnet accounts
from [portal.hedera.com](https://portal.hedera.com/) (ECDSA keys,
`0x`-prefixed). Copy `testbed/.env.example` to `testbed/.env`, then:

```bash
cd testbed   && npm install && npm start   # :8402  good / bad-replay / bad-delivery
cd apps/api  && npm install && npm start   # :8403  Preflight sold per call

cd packages/checks
npm run p4 -- http://localhost:8402/good http://localhost:8402/bad-delivery
npm run a1 -- http://localhost:8402/good http://localhost:8402/bad-replay
```

> ⚠️ Heads up: Blocky402's facilitator API lives at
> `https://api.testnet.blocky402.com`, not `https://blocky402.com/`, which
> is just the marketing site and will 404. Details in
> [`HEDERA_FEEDBACK.md`](./HEDERA_FEEDBACK.md).

## Built on Hedera and Bazantic

Full sponsor write-ups, with all the evidence: **[Hedera →](./docs/simple/hedera.md)** ·
**[Bazantic →](./docs/simple/bazantic.md)**

In short, the whole payment layer runs on Hedera: a real agent discovers
Preflight's on-chain identity, pays for a check over x402/Blocky402, decides
based on the verdict, and every completed check writes an unforgeable
receipt to Hedera Consensus Service
([`0.0.10519901`](https://hashscan.io/testnet/topic/0.0.10519901)). We also
filed a real fix against Hedera's own tooling:
[hedera-dev/hedera-harness#78](https://github.com/hedera-dev/hedera-harness/pull/78).
On Bazantic, Preflight is wrapped as a reusable recipe that combines with
Hedera's own mirror node to catch a scam neither service catches alone, see
the write-up for the exact fake-endpoint proof.

## Honest limitations

- **Sepolia only.** Multi-chain support exists in the code but only Sepolia
  was actually scanned.
- **~1,541 agents' metadata couldn't be read**, mostly because public IPFS
  gateways refuse automated traffic, recorded, not hidden.
- **P3 (price match) almost never runs**, the registry standard has no
  price field, so there's usually nothing to compare against, and we
  refuse to guess a number out of free-text descriptions.
- **A2–A4 aren't built.**
- **A stranger's endpoint can never be marked `SAFE`**, direct consequence
  of never spending money against people who haven't consented to it.
- **A public name that resolves to a private address (DNS rebinding) isn't
  caught**, we only check the hostname, not where it actually resolves.
- **Free hosting tiers sleep.** A cold instance that doesn't answer in time
  gets reported `DEAD`, accurate at the moment checked, but worth knowing.

## More docs

| | |
|---|---|
| [`docs/simple/`](./docs/simple/) | **Start here for the plain-English version**, including dedicated Hedera and Bazantic write-ups |
| [`ETHICS.md`](./ETHICS.md) | The boundary, and how it's enforced in code |
| [`METHODOLOGY.md`](./METHODOLOGY.md) | Exactly how every check works, so results can be replayed |
| [`PRIOR_ART.md`](./PRIOR_ART.md) | What exists already, what's ours |
| [`ATTRIBUTION.md`](./ATTRIBUTION.md) | New work vs. reused |
| [`AI_USAGE.md`](./AI_USAGE.md) | How AI was used, and the mistakes we caught |
| [`DEPLOY.md`](./DEPLOY.md) | How to host it |
| [`docs/findings.md`](./docs/findings.md) | The published dataset write-up |
| [`HEDERA_FEEDBACK.md`](./HEDERA_FEEDBACK.md) | Friction log, written live |
| `data/**` | Every raw scan, liveness round, and report |
