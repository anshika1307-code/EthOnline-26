# Prior art

What already exists, and precisely where Preflight differs. Written so a
reviewer can check the claim rather than take it on faith.

## The gap in one line

QuickNode, Assay Labs, Origin DAO and AgentPass all read on-chain registry data
and compute reputation from it. **None of them contacts the endpoint.** Sumsub's
KYA covers compliance identity, not endpoint behaviour. Preflight adds the live
behavioural layer.

## Tools

| Project | What it does | What it does not do |
|---|---|---|
| [QuickNode ERC-8004 Explorer](https://erc-8004.quicknode.com/) ([writeup](https://blog.quicknode.com/the-quicknode-erc-8004-stack-a-public-window-into-onchain-agents/)) | Public window onto on-chain agents: identities, feedback, validation records | Never calls a declared endpoint |
| Assay Labs | Reads registry data, computes reputation | Never calls a declared endpoint |
| Origin DAO | Registry data and reputation signals | Never calls a declared endpoint |
| AgentPass | Agent discovery/access surface | Not a behavioural safety check before payment |
| [Sumsub KYA](https://sumsub.com/) | "Know Your Agent" compliance identity framework | Compliance identity, not endpoint behaviour. **Also why we are not called KYA** |
| [awesome-erc8004](https://github.com/sudeepb02/awesome-erc8004) | Ecosystem index | A list, not a checker |

Reputation is a *lagging* signal built from what other people report. Preflight
is a *leading* signal measured at the moment you are about to pay.

## Papers

**Core — why this exists**

- **Five Attacks on x402 Agentic Payment Protocol** — [arXiv:2605.11781](https://arxiv.org/abs/2605.11781).
  Five practical attacks across authorization, binding, replay protection and
  web-layer handling, validated on live endpoints, producing unpaid-service or
  paid-but-denied outcomes. April 2026 snapshot: 13,760 endpoints across 420
  domains, top nine domains 87.8%, single top domain 77.5%. Anchors P2, P3, P4,
  A1 and the P5 comparator.
- **When HTTP 402 Meets the Blockchain** — [arXiv:2607.19545](https://arxiv.org/abs/2607.19545).
  15 facilitators serving 60,000+ sellers and 360,000+ buyers; rule violations
  in **every one**. Free shopping, asset theft, service denial, gas abuse.

**Supporting**

- **From Agent Identity to Agent Economy** — [arXiv:2606.12128](https://arxiv.org/abs/2606.12128).
  Of the first 10,000 ERC-8004 agents: 67 expose service records, 628 have any
  feedback, 19 have everything; top 10 wallets own 51.4%. *"Registration-heavy
  but operationally shallow."* This is the number Preflight extends — the paper
  measured **declaration**, we measure **behaviour**.
- **Free-Riding the Agentic Web** — [arXiv:2605.30998](https://arxiv.org/abs/2605.30998).
  Independent team, overlapping findings on the check/settle gap.
- **A402: Bridging Web 3.0 Payments and Web 2.0 Services** — [arXiv:2603.01179](https://arxiv.org/abs/2603.01179).
  Names our exact gap: a server can act before payment is confirmed. Their fix
  needs TEEs and a protocol change. **We take their diagnosis, not their cure** —
  P4 detects the failure they describe, deployable today.
- **SoK: Blockchain Agent-to-Agent Payments** — [arXiv:2604.03733](https://arxiv.org/abs/2604.03733).
  Gives the discovery / authorization / execution / accounting vocabulary.
- **AgentAudit** — [arXiv:2609.09875](https://arxiv.org/abs/2609.09875).
  Precedent for "attach and observe without constraining the implementation."
- **APEX** — [arXiv:2604.02023](https://arxiv.org/abs/2604.02023).
  Agent payments on non-crypto rails. Out of scope here, but our check logic is
  rail-agnostic — the same questions apply to UPI-style flows.

## What we take from prior work, and what is ours

**Taken:** the attack taxonomy (Papers 1 and 2), the operational-readiness
framing and the 67/10,000 baseline (Paper 3), the four-stage vocabulary
(Paper 8), and the practice of anonymising domains when reporting
concentration (Paper 1).

**Ours:** implementing those published attacks as a runnable check suite; the
Group P / Group A ethics split with the boundary enforced in code; measuring
the *behavioural* layer nobody has published — of agents that declare an
endpoint, how many answer, and how many accept payment; and selling the check
itself over x402, so it can sit inside the payment flow instead of beside it.

## Standards and specs

- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) · [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts)
- [x402](https://github.com/x402-foundation/x402) · [whitepaper](https://www.x402.org/x402-whitepaper.pdf) · [Hedera x402](https://docs.hedera.com/solutions/ai/x402) · [Blocky402](https://blocky402.com/)
