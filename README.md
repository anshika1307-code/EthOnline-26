# Preflight

> Every pilot runs a preflight check. Your agent should too.

**Before your AI agent pays a stranger's API, Preflight checks whether that
endpoint is alive, honestly priced, and actually delivers.**

ETHOnline 2026 · Start Fresh track · solo

## Live

| | |
|---|---|
| Dashboard + free passive scan | https://eth-online-26.vercel.app |
| Paid API (x402 on Hedera testnet, Blocky402) | https://ethonline-26.onrender.com — `GET /pricing`, `GET /receipts`, `POST /check` |
| Testbed (our own endpoints, the only target of active checks) | https://testbed-1l2m.onrender.com |
| On-chain identity | ERC-8004 agent **#119** on Hedera testnet, registry `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Payment audit trail | HCS topic [`0.0.10519901`](https://hashscan.io/testnet/topic/0.0.10519901) |

End to end, with nothing hard-coded: the buyer agent reads agent #119 from the
registry, finds the x402 service in its registration file, pays for a check,
decides whether to pay the target, and points at the HCS receipt.

```bash
cd packages/checks && npx tsx src/bin/buyer-agent.ts https://testbed-1l2m.onrender.com/good
```

---

## The problem

A July 2026 study of 15 x402 facilitators serving 60,000+ sellers and 360,000+
buyers found rule violations in **every one**, enabling free shopping, asset
theft, service denial and gas abuse ([arXiv:2607.19545](https://arxiv.org/abs/2607.19545)).
A separate study demonstrated five practical attacks producing unpaid-service
or paid-but-denied outcomes ([arXiv:2605.11781](https://arxiv.org/abs/2605.11781)).
Meanwhile only 67 of the first 10,000 registered ERC-8004 agents even expose a
service endpoint ([arXiv:2606.12128](https://arxiv.org/abs/2606.12128)).

Agents are being asked to pay strangers with no way to check first.

## What exists already, and what it doesn't do

QuickNode's Explorer, Assay Labs and Origin DAO all read on-chain registry data
and compute reputation from it. **None of them contacts the endpoint.** Sumsub's
KYA covers compliance identity, not endpoint behaviour. Preflight adds the live
behavioural layer. Full comparison in [`PRIOR_ART.md`](./PRIOR_ART.md).

## What we found

### The funnel

Full ERC-8004 Identity Registry on Ethereum Sepolia, scanned 12 Sep 2026 —
**every agent, not a sample**.

| | Agents | Of registry |
|---|---|---|
| Registered | **10,249** | 100% |
| Declare an addressable service endpoint | **85** | 0.83% |
| Have an endpoint that answers | **37** | 0.36% |
| Are actually paywalled with x402 | **5** | 0.05% |
| Offer a **well-formed** payment quote | **5** | **0.05%** |

**Five agents in ten thousand are ready to be paid** — and four of them speak a
protocol version the fifth cannot.

Prior work ([arXiv:2606.12128](https://arxiv.org/abs/2606.12128)) measured
*declaration* and found 67 of the first 10,000 agents (0.67%). Our declaration
figure — 0.83% at full-registry scale — independently corroborates that. The
rows beneath it are behaviour, and nobody has published them.

### The payable agent economy is split across incompatible protocol versions

All five paywalled agents are alive, correctly return `402 Payment Required`,
and offer a **well-formed quote**. None is broken. But they do not speak the
same protocol:

| Agents | x402 | Chain | Asset |
|---|---|---|---|
| 6382, 6425, 6498 | **v1** | Base mainnet | USDC |
| 6553 | **v1** | Base Sepolia | USDC |
| 10123 | **v2** | Hedera testnet | HBAR |

x402 v1 and v2 are not wire-compatible. v1 puts the quote in the response body
and names the amount `maxAmountRequired`; v2 puts it in a `PAYMENT-REQUIRED`
header and names it `amount`. v1 sends payment as `X-PAYMENT`, v2 as
`PAYMENT-SIGNATURE`, and a v2 resource server does not read `X-PAYMENT` at all.

**A buyer built against v2 cannot pay four of the five payable agents in the
registry**, and will not get a useful error — the quote simply looks malformed,
or the payment header is silently ignored.

We know because it happened to us twice: once when our own testbed silently
stopped being vulnerable (the bug behind our
[Hedera Harness PR](./data/harness-pr/)), and again when this very check
reported all four v1 agents as "missing `amount`". They were not broken. Our
v2-only validator was. Both are recorded in [`METHODOLOGY.md`](./METHODOLOGY.md).

### What the other 10,164 look like

| Category | Agents |
|---|---|
| `confirmed-empty` — metadata resolved, `services: []` | 7,707 |
| `unknown-gateway-failed` — metadata unreadable | 1,541 |
| `junk-placeholder` — RFC 2606 reserved domain | 407 |
| `no-uri` — registered, nothing published | 374 |
| `confirmed-no-endpoint` — services, none addressable | 135 |
| `confirmed-has-endpoint` | 85 |

Of the 1,541 unreadable, **795 were attempted and failed** against every IPFS
gateway; **746 were never attempted** because the circuit breaker had already
tripped. Different epistemic states, distinguished in the error text.

### Concentration — where we disagree with the literature

Paper 1 measured 13,760 x402 endpoints across 420 domains with the top domain
at **77.5%**. Our registry shortlist — 149 endpoints across **44 domains** —
has a top domain of just **11.4%**, top three 31%.

Different corpus, genuinely different answer: the ERC-8004 registry is *not*
concentrated the way the x402 endpoint population is. We report that rather
than quietly dropping a check that failed to confirm the prior.

Ownership is the sharper signal: **42 distinct owners** behind those 85 agents,
with the **top ten holding 61.2%**.

### Caveat we will not bury

No third-party endpoint can ever be marked `SAFE` here, because we do not spend
money against strangers — `SAFE` requires a completed payment (P4), which we
run only against our own testbed. Third-party verdicts top out at `CAUTION`.
That is a consequence of the ethics boundary, not an oversight.


## Ethics and safety boundary — READ THIS TWICE

**Do not run Group A checks against endpoints you do not own.** Replay attempts, free-shopping attempts and gas-abuse probes against third-party services are unauthorised testing. The papers did this under a responsible-disclosure process. That authorisation does not transfer to you.

Rules for this project:

1. **Live third-party endpoints: Group P only.** Passive, one request per round, sensible timeouts.
2. **Group A runs only against our own deployed testbed.**
3. **Identify ourselves.** Send a user-agent string naming the project with a link back to the repo.
4. **Respect rate limits and any refusal signal.** If an endpoint asks us to stop, we stop.
5. **Publish the methodology** so any result can be replayed and challenged.
6. **Report facts, not accusations.** "Returned 500 after payment on 2026-09-12" — not "this agent is a scam."
7. **No naming and shaming in the demo.** Use anonymised IDs for third parties.

This is **enforced in code**, not by convention: every Group A check calls
`assertOwnTestbed()` as its first line, which throws for any host not on our
own allowlist. There is a test asserting a third-party host throws. The paid
API cannot run Group A **at any price**. See [`ETHICS.md`](./ETHICS.md).

## The check suite

**Group P — passive, safe against anyone**

| | Check | Catches |
|---|---|---|
| P1 | Liveness | Declared but dead. 3 rounds, so "dead 3/3" not "dead once" |
| P2 | Quote validity | Malformed or missing 402 payment quote |
| P3 | Price consistency | Quoted price ≠ advertised price |
| P4 | **Delivery** | Paid, got nothing. The headline failure mode in both core papers |
| P5 | Discovery concentration | One domain dominating the shortlist |

**Group A — active, our own testbed only**

| | Check | Catches |
|---|---|---|
| A1 | Replay window | Same payment proof accepted twice → free shopping |
| A2–A4 | Idempotency, settlement timing, allowance scope | Not implemented — out of scope for the event |

Verdicts are **SAFE / CAUTION / UNSAFE / DEAD / UNKNOWN**. Deliberately not a
score: QuickNode already ships a reputation number, and we report findings, not
opinions. `SAFE` requires a **completed payment** — an endpoint that merely
answers a GET is `UNKNOWN`, not safe to pay.

## Architecture

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

## The payment flow

Preflight is both a **consumer** and a **seller** of x402 payments on Hedera.

**As a seller** (`apps/api`) — the safety check itself is sold per call:

1. `POST /check` unpaid → **HTTP 402** with a `PAYMENT-REQUIRED` header
   carrying `{scheme, network, amount, asset, payTo, extra.feePayer}`
2. The caller builds a `TransferTransaction` with the facilitator's `feePayer`
   as transaction payer, **partially signs** it, and does not submit
3. Retry with the `PAYMENT-SIGNATURE` header (x402 **v2** — `X-PAYMENT` is v1
   and is not read by a v2 server)
4. Our server forwards to Blocky402 `/verify` → `/settle`; the facilitator
   co-signs, pays gas, and submits to Hedera
5. On success we return the Preflight report, with the settlement receipt in
   `PAYMENT-RESPONSE`

**As a buyer** (`packages/checks` P4) — the delivery check pays a target
endpoint one real, legitimate payment and verifies the resource comes back.
A hard per-payment spend cap is enforced by the x402 client *before anything is
signed*.

### Metered, not flat

The price is the work: `amount = unit(depth) × distinct endpoints`, up to 10 per request.

| depth | runs | tinybar per endpoint |
|---|---|---|
| `full` (default) | P1 + P2 + P3 | 100,000 (0.001 HBAR) |
| `liveness` | P1 only | 40,000 |

```bash
POST /check { "endpoint": "https://..." }                                    # 100,000
POST /check { "endpoints": ["https://a", "https://b", "https://c"],
              "depth": "liveness" }                                          # 120,000
```

The 402 quote is computed from the request body, and the paid retry is
re-priced from *its* body with the same parser ([apps/api/src/metering.ts](apps/api/src/metering.ts)).
So a payment signed for one endpoint can't be used for ten. We tested that
against the running server on testnet:

| request | quoted | result |
|---|---|---|
| 1 endpoint, full | 100,000 | paid, settled `0.0.7162784@1789295746.951052963` (mirror node: −100,000 / +100,000) |
| 3 endpoints, liveness | 120,000 | paid, settled `0.0.7162784@1789295758.705983867` (mirror node: −120,000 / +120,000), HCS receipt seq 10 records the meter |
| signature for the 1-endpoint quote, replayed with a 5-endpoint body | re-quoted 500,000 | **402 `No matching payment requirements`, nothing settled** |
| same signature, original 1-endpoint body (control) | 100,000 | paid, settled `0.0.7162784@1789295819.841622433` |

The control row matters: it shows the attack was refused because of the price
mismatch, not because the signature was bad.

`GET /pricing` returns the formula, units and cap. HBAR is asset `0.0.0` and
amounts are in tinybars (1 HBAR = 10⁸).

## Run it

```bash
npm install
node scripts/verify-claims.mjs           # re-derive every published number from data/
cp .env.local.example .env.local         # set RPC_URL for Sepolia

# 1. scan the registry  (~6 min for all 10,249 agents)
npm run fetch-agents                     # MAX_AGENTS=500 for a quick pass

# 2. liveness over every declared endpoint
cd packages/checks && npm install && npm run p1

# 3. render Preflight reports (hosts anonymised by default)
npm run report

# 4. dashboard
cd ../.. && npm run dev                  # http://localhost:3000
```

**Payments** need two funded Hedera testnet accounts from
[portal.hedera.com](https://portal.hedera.com/) — ECDSA keys, `0x`-prefixed.
Copy `testbed/.env.example` to `testbed/.env`.

```bash
cd testbed   && npm install && npm start   # :8402  good / bad-replay / bad-delivery
cd apps/api  && npm install && npm start   # :8403  Preflight sold per call

cd packages/checks
npm run p4 -- http://localhost:8402/good http://localhost:8402/bad-delivery
npm run a1 -- http://localhost:8402/good http://localhost:8402/bad-replay
```

> ⚠️ The facilitator URL is `https://api.testnet.blocky402.com`. The prize page
> links `https://blocky402.com/`, which is the marketing site — pointing an
> x402 server at it 404s and every gated route then 500s. See
> [`HEDERA_FEEDBACK.md`](./HEDERA_FEEDBACK.md).

## Sponsor technology

**Hedera** — the whole payment layer.

*The loop the track asks for — an agent discovering a service and paying for it
with no API key, account, or subscription — runs end to end:*

```
1. DISCOVER  buyer agent reads Preflight's ERC-8004 entry (#119) off the Hedera registry
2. PAY       buys a safety check over x402, settled through Blocky402
3. DECIDE    uses the verdict to decide whether to pay the target at all
4. AUDIT     the check it paid for is recorded as a receipt on HCS
```

`packages/checks/src/bin/buyer-agent.ts` · the decision rule is tested so it
never claims something the checks did not observe.

- **Verifiable payment audit trail on HCS** — every settled check writes one
  receipt to topic [`0.0.10519901`](https://hashscan.io/testnet/topic/0.0.10519901)
  linking what was checked and the verdict to the settlement transaction that
  paid for it. Written only *after* settlement, so a receipt always corresponds
  to money that moved. The topic has a submit key, so receipts cannot be
  forged; anyone can read them from the mirror node without an account.
  [`apps/api/src/hcs.ts`](./apps/api/src/hcs.ts)
- x402-gated service on Hedera testnet settled through Blocky402:
  [`apps/api/src/server.ts`](./apps/api/src/server.ts)
- Real paid requests end-to-end, buyer side:
  [`packages/checks/src/checks/p4-delivery.ts`](./packages/checks/src/checks/p4-delivery.ts)
- Three x402 endpoints of our own: [`testbed/src/server.ts`](./testbed/src/server.ts)
- **Preflight is itself registered as ERC-8004 agent #119 on Hedera testnet** —
  [tx](https://hashscan.io/testnet/transaction/0xe10a31b584a0cf2dbfacd71b21482359416c7bba183d63b19083a4621882f99c),
  registration stored fully on-chain as a base64 `data:` URI. Once the paid API
  was hosted we pointed the entry at it
  ([setAgentURI tx](https://hashscan.io/testnet/transaction/0x2610b4227e4767ba8963a7320ded2587ed6556ce0c6e6e2188b5fbc293455327));
  our own classifier now rates it `confirmed-has-endpoint`. Before that it rated
  `confirmed-no-endpoint` — we made no exception for our own entry.
  Evidence: [`data/agent-registration/`](./data/agent-registration/)
- On-chain agent identity via **ERC-8004**, read directly from the registry:
  [`packages/registry/src/fetch-agents.ts`](./packages/registry/src/fetch-agents.ts)
- **Harness contribution**: [hedera-dev/hedera-harness#78](https://github.com/hedera-dev/hedera-harness/pull/78)
  correcting the x402 v1/v2 payment header in
  `docs/prds/x402-metered-api.md` — patch and description in
  [`data/harness-pr/`](./data/harness-pr/), friction logged live in
  [`HEDERA_FEEDBACK.md`](./HEDERA_FEEDBACK.md)

**Bazantic** — Preflight as an agent tool, composed with the Hedera mirror node.

- Recipe *"Should my agent pay this x402 endpoint"*: Preflight pulls the payee
  out of the quote, the mirror node for that same network checks the payee
  exists, can receive, and has been paid before. Our `/bad-payee` testbed route
  quotes perfectly (Preflight: `UNKNOWN`) and pays an account that doesn't
  exist (combined: `DO_NOT_PAY`).
- It refuses to cross networks: `0.0.10475917` is our receiver on testnet and an
  unrelated funded account on mainnet.
- Gateway upstream routes and spec: [`apps/api/src/gateway.ts`](./apps/api/src/gateway.ts) ·
  decision rules as tested code: [`packages/checks/src/payee.ts`](./packages/checks/src/payee.ts) ·
  recipe, oracle, test plan and setup: [`integrations/bazantic/`](./integrations/bazantic/)

## Honest limitations

- **Sepolia only.** Multi-chain is parameterised but only Sepolia was scanned.
- **Public IPFS gateways refuse this traffic**, so ~1,541 agents' metadata could
  not be read; 748 of those were never attempted once the circuit breaker
  tripped. That is recorded, not hidden.
- **P3 almost never runs.** ERC-8004 has no price field, so there is usually
  nothing to compare a quote against. We do not guess prices from prose.
- **P5 needs a bigger corpus** than the endpoint shortlist provides to say
  anything strong about domain concentration.
- **A2–A4 not implemented.**
- **Third-party verdicts can never be `SAFE`**, because we do not spend money
  against strangers. That falls out of the ethics boundary and is intentional.
- **Private-address refusal is by hostname, not DNS.** Every front door refuses
  loopback, private, link-local and metadata addresses, but a public name that
  resolves to a private IP (DNS rebinding) is not caught.
- **Cold starts read as dead.** The API and testbed are free Render instances.
  A sleeping endpoint that doesn't answer within P1's timeout is reported
  `DEAD`, ours included — which is accurate at the moment it was checked.
- **The Bazantic recipe is a prompt.** It's tested against a code oracle
  ([`integrations/bazantic/TEST_PLAN.md`](./integrations/bazantic/TEST_PLAN.md)),
  but an LLM can still deviate; the oracle is how you'd notice.

## Docs

| | |
|---|---|
| [`ETHICS.md`](./ETHICS.md) | The boundary, and how it is enforced |
| [`METHODOLOGY.md`](./METHODOLOGY.md) | Every check, exactly how it works, so results replay |
| [`PRIOR_ART.md`](./PRIOR_ART.md) | What exists, what we take, what is ours |
| [`ATTRIBUTION.md`](./ATTRIBUTION.md) | New work vs reused |
| [`AI_USAGE.md`](./AI_USAGE.md) | AI disclosure, and the corrections review caught |
| [`DEPLOY.md`](./DEPLOY.md) | How to host it, and what breaks if you don't read it |
| [`docs/findings.md`](./docs/findings.md) | **The published dataset writeup** — findings, method, limitations, citation |
| [`HEDERA_FEEDBACK.md`](./HEDERA_FEEDBACK.md) | Friction log, written live |
| `data/**` | Every raw scan, liveness round and report |
