# Prior art

What already exists, and exactly where Preflight is different. Written so
you can check the claim rather than take it on faith.

## The gap, in one line

A handful of tools (QuickNode's Explorer, Assay Labs, Origin DAO, AgentPass)
read on-chain registry data and compute a reputation signal from it. **None
of them actually contacts the endpoint.** Sumsub's "Know Your Agent"
product covers compliance identity, not whether the thing behind it works.
Preflight is the piece that actually knocks on the door.

## Existing tools

| Project | What it does | What it doesn't do |
|---|---|---|
| [QuickNode ERC-8004 Explorer](https://erc-8004.quicknode.com/) | Public window into on-chain agent identities and feedback | Never calls the declared endpoint |
| Assay Labs | Reads registry data, computes reputation | Never calls the declared endpoint |
| Origin DAO | Registry data and reputation signals | Never calls the declared endpoint |
| AgentPass | Agent discovery / access | Not a pre-payment safety check |
| [Sumsub KYA](https://sumsub.com/) | "Know Your Agent" compliance identity | Compliance identity, not endpoint behavior, also why we're not called KYA |
| [awesome-erc8004](https://github.com/sudeepb02/awesome-erc8004) | Ecosystem index | A list, not a checker |

Reputation is a *lagging* signal, built from what other people already
reported. Preflight is a *leading* signal, measured the moment you're about
to pay.

## The research this builds on

**The two papers that motivated this project:**

- **Five Attacks on x402 Agentic Payment Protocol**, [arXiv:2605.11781](https://arxiv.org/abs/2605.11781).
  Five real, working attacks against live endpoints, all ending with the
  buyer unpaid-for or paid-but-denied. Also measured endpoint concentration:
  13,760 endpoints, top domain at 77.5%.
- **When HTTP 402 Meets the Blockchain**, [arXiv:2607.19545](https://arxiv.org/abs/2607.19545).
  Studied 15 payment facilitators serving 60,000+ sellers, found rule
  violations in **every one** of them.

**Supporting work:**

- **From Agent Identity to Agent Economy**, [arXiv:2606.12128](https://arxiv.org/abs/2606.12128).
  Found only 67 of the first 10,000 registered agents expose a service at
  all, "registration-heavy but operationally shallow." Preflight extends
  this: they measured *declaration*, we measure *behavior*.
- **Free-Riding the Agentic Web**, [arXiv:2605.30998](https://arxiv.org/abs/2605.30998).
  An independent team, overlapping findings.
- **A402: Bridging Web 3.0 Payments and Web 2.0 Services**, [arXiv:2603.01179](https://arxiv.org/abs/2603.01179).
  Names the exact gap Preflight's delivery check targets, a server can act
  before payment is confirmed. Their proposed fix needs new hardware and a
  protocol change; we took their diagnosis, not their cure, and built
  something deployable today instead.
- **SoK: Blockchain Agent-to-Agent Payments**, [arXiv:2604.03733](https://arxiv.org/abs/2604.03733).
  Gives the shared vocabulary (discovery / authorization / execution /
  accounting) this project's checks map onto.
- **AgentAudit**, [arXiv:2609.09875](https://arxiv.org/abs/2609.09875).
  Precedent for observing an agent's behavior without constraining how it's
  built.

## What we took, and what's ours

**Taken:** the attack taxonomy from the two core papers, the "registration
vs. operational" framing and the 67/10,000 baseline, and the practice of
anonymizing domains when reporting concentration.

**Ours:** turning those published attacks into an actual, runnable check
suite; the strict passive/active split with the boundary enforced in code,
not just policy; measuring the behavioral layer nobody had published,
of the agents that declare an endpoint, how many actually answer, and how
many actually accept a payment; and selling the check itself over the same
payment protocol it evaluates, so it lives inside the payment flow instead
of beside it.

## Standards this builds on

- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004), on-chain agent identity
- [x402](https://github.com/x402-foundation/x402) · [Hedera's x402 docs](https://docs.hedera.com/solutions/ai/x402) · [Blocky402](https://blocky402.com/)
