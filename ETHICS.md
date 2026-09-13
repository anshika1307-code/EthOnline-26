# Ethics and safety

Preflight checks whether it's safe to pay a stranger's API — which means
pointing a scanner at endpoints other people own. This is the line we hold
while doing that.

Section 1 is reproduced verbatim from our own planning brief (`preflight-brief-v3.md` §4) and from the README.

---

## 1. Read this twice

**We never run our aggressive checks against endpoints we don't own.**
Trying to replay a payment, trick a service into double-serving, or abuse
its gas is unauthorized testing, even done with good intentions. Academic
papers get to do this kind of testing under a formal responsible-disclosure
agreement — that permission doesn't transfer to us.

The rules:

1. **Against anyone else's live endpoint: passive checks only.** One
   request per round, sensible timeouts.
2. **The aggressive checks run only against our own deployed test
   services.** See section 5.
3. **We identify ourselves** — every request carries a name and a link
   back to this repo.
4. **We respect rate limits and any refusal signal.** Asked to stop, we
   stop.
5. **We publish the method**, so any result can be replayed and challenged.
6. **We report facts, not accusations.** "Returned 500 after payment" —
   not "this agent is a scam."
7. **No naming and shaming in the demo.** Third parties are anonymized,
   the same way the papers we build on anonymized domains — because the
   finding is a pattern, not a person.

## 2. Which checks are which

| Group | Checks | Can run against |
|---|---|---|
| **P — passive** | liveness, quote validity, price match, delivery, concentration | **anyone's** live endpoint |
| **A — active** | replay, idempotency, settlement timing, allowance scope | **our own test services only** |

Every passive check is something an ordinary paying customer does anyway —
even the delivery check is just making one real, legitimate payment and
seeing if the thing shows up. Nothing in that group is adversarial. The
active checks deliberately try to break things, which is exactly why
they're fenced off.

## 3. How the fence is actually enforced

A rule in a document isn't a safeguard. This one is enforced in code:

- `packages/checks/src/guard.ts` exposes a function, `assertOwnTestbed()`.
- Every active check calls it as its first line.
- It throws unless the target is on our own pre-approved list of hosts.
- If a scan hits this guard, it records the check as *skipped* with the
  reason, and the report says so plainly — it doesn't just silently omit
  the check.
- There's an automated test proving a third-party host gets refused.

If you're adding a new check, the question isn't "is this useful" — it's
"would a stranger consent to receiving this request."

## 4. How we identify ourselves

Every request Preflight makes carries:

```
User-Agent: Preflight/0.1 (+<repo url>) ERC-8004 endpoint checker
```

If an endpoint returns 429, refuses us, or gives any kind of "back off"
signal, we stop — no rotating identities, no spoofing, no working around
blocks.

## 5. Spending limits

The delivery check spends real money on testnet. Guardrails:

- A hard cap per payment, set in config
- One payment per endpoint per round — no loops, no retries that could
  double-spend
- Every transaction hash recorded and checkable against a block explorer
- We test against our own endpoints first, before ever pointing this check
  at anything we don't own

## 6. Reporting honestly

- **Facts, never accusations.** "Paid 0.01, got HTTP 500, no body" — not
  "this agent steals money." A failing check is a measurement, not a
  verdict on anyone's intent, and something failing today may be fixed
  tomorrow.
- **No rival trust score.** We report findings, not opinions.
- **Third parties are anonymized** in the demo, dataset, and video —
  because the finding is a pattern (like "one domain dominates"), not a
  specific accusation.
- **We never publish a number we can't reproduce.** Every statistic traces
  back to a file in `data/`. If a scan didn't run, we say so.
- **Negative results are still results.** If most endpoints are dead, we
  report exactly that, plainly, instead of hunting for a better story.

## 7. Competition rules we're following

- **Start Fresh compliance.** All project-specific work began after the
  hackathon opened. Nothing pre-event was imported.
- **AI disclosure.** This project leaned heavily on AI assistance — see
  [`AI_USAGE.md`](./AI_USAGE.md) for exactly which tools, and where.
- **Attribution.** [`ATTRIBUTION.md`](./ATTRIBUTION.md) separates new work
  from reused libraries and starter kits.
- **Honest commit history.** Incremental, unsquashed, spread across the
  event — not rewritten after the fact.

## 8. What we deliberately don't do

Stated plainly, because the absence is a choice, not an oversight:

- No aggressive checks against third parties, ever, under any deadline
- No rival trust score
- No on-chain writes beyond our own payments
- No collecting or publishing personal data about agent operators
- No naming individual agents or domains as bad actors
- No re-testing an endpoint that has asked us to stop

## 9. If we get this wrong

If an endpoint operator contacts us about our traffic: we stop scanning
that endpoint immediately, remove it from published data on request, and
record what happened. Being correctable is part of the boundary.
