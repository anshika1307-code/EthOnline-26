
# Ethics and Safety

Preflight tests whether it is safe to pay a stranger's API. That means pointing
a scanner at endpoints other people own. This document is the boundary we hold
while doing it.

Section 1 is reproduced **verbatim** from `preflight-brief-v3.md` §4 and is
also reproduced in the README.

---

## 1. Ethics and safety boundary — READ THIS TWICE

**Do not run Group A checks against endpoints you do not own.** Replay attempts, free-shopping attempts and gas-abuse probes against third-party services are unauthorised testing. The papers did this under a responsible-disclosure process. That authorisation does not transfer to you.

Rules for this project:

1. **Live third-party endpoints: Group P only.** Passive, one request per round, sensible timeouts.
2. **Group A runs only against our own deployed testbed.** See section 5.
3. **Identify ourselves.** Send a user-agent string naming the project with a link back to the repo.
4. **Respect rate limits and any refusal signal.** If an endpoint asks us to stop, we stop.
5. **Publish the methodology** so any result can be replayed and challenged.
6. **Report facts, not accusations.** "Returned 500 after payment on 2026-09-12" — not "this agent is a scam."
7. **No naming and shaming in the demo.** Use anonymised IDs for third parties, exactly as Paper 1 anonymised domains because the issue was concentration, not attribution.

---

## 2. Which checks are which

| Group | Checks | May run against |
|---|---|---|
| **P — passive** | P1 liveness · P2 quote validity · P3 price consistency · P4 delivery · P5 concentration | Anyone's live endpoint |
| **A — active** | A1 replay · A2 idempotency · A3 settlement timing · A4 allowance scope | **Our own testbed only** |

Every Group P check is something an ordinary paying customer does. P4 makes
**one real, legitimate payment** and checks whether the resource comes back —
that is a purchase, not an attack. Nothing in Group P is adversarial.

Group A deliberately tries to break things. That is why it is fenced.

## 3. How rule 2 is enforced

A comment is not a safeguard. The boundary is enforced in code:

- `packages/checks/src/guard.ts` exposes `assertOwnTestbed(url, checkId)`
- Every Group A check calls it as its **first line**
- It throws unless the host is in `OWN_TESTBED_HOSTS`, our own deploy allowlist
- A scan that hits the guard records the check as `skipped` with the reason, and
  continues — the report shows *"Checks A1–A4 not run: third-party endpoint,
  passive mode only."*
- There is a unit test asserting a third-party host **throws**

If you are reading this because you want to add a check, the question is not
"is this useful" but "would a stranger consent to receiving this request."

## 4. Identifying ourselves

Every request Preflight makes carries:

```
User-Agent: Preflight/0.1 (+<repo url>) ERC-8004 endpoint checker
```

If an endpoint returns 429, a refusal, or a robots-style signal, we back off
and stop. We do not rotate identity, spoof user agents, or route around blocks.

## 5. Spending limits

P4 spends real money on testnet. Guardrails:

- A hard per-payment cap in config
- One payment per endpoint per round — no loops, no retries that could double-spend
- Every transaction hash recorded and reconcilable against the explorer
- We test against our own `good` and `bad-delivery` endpoints before pointing
  P4 at anything we do not own

## 6. Reporting honestly

- **Facts, never accusations.** *"Paid 0.01, returned HTTP 500, no body"* — not
  *"this agent steals money."* A failing check is a measurement, not a verdict
  on anyone's intent.
- **No rival reputation score.** We report findings, not opinions. An agent
  that fails today may be fine tomorrow; the report is timestamped for exactly
  that reason.
- **Third parties are anonymised** in the demo, the dataset and the video.
  Paper 1 anonymised domains because the finding was concentration, not
  attribution. Same here.
- **Never fabricate a number.** Every statistic we publish must be
  reproducible from a file in `data/`. If a scan did not run, we say so. A
  small honest finding beats an inflated one.
- **Negative results are still results.** If most endpoints are dead, that is
  the finding, and we report it plainly rather than hunting for a better story.

## 7. Competition integrity

From `competition.md` (the ETHGlobal rules) and `rules.md`:

- **Start Fresh compliance.** All project work began after the hackathon
  started. No pre-event project-specific code, designs or assets.
- **AI disclosure.** This project was built with heavy AI assistance. Per the
  event rules, `AI_USAGE.md` documents which tools were used and where —
  including which files were AI-generated or AI-assisted.
- **Spec-driven workflow artifacts are committed.** The event rules require
  that if you use a spec-driven workflow, *all spec files, prompts and planning
  artifacts* ship in the repo. Ours do: the briefs, `ROADMAP.md`,
  `IMPLEMENTATION_PLAN.md`, `rules.md` and this file.
- **Meaningful human contribution.** The judgement calls — the P/A split, this
  boundary, the category scheme in `METHODOLOGY.md`, the verdict bands, what to
  cut — are the author's, and are defensible in the 3-minute Q&A.
- **Attribution.** `ATTRIBUTION.md` separates new work from reused libraries
  and starter kits.
- **Honest commit history.** Incremental, unsquashed, spread across the event.

## 8. What we deliberately do not do

Stated plainly because the absence is a choice, not an oversight:

- No Group A checks against third parties, under any deadline pressure
- No rival reputation score
- No on-chain writes beyond our own payments
- No collecting or publishing personal data about agent operators
- No naming individual agents or domains as bad actors
- No re-testing an endpoint that asked us to stop

## 9. If we get this wrong

If an endpoint operator contacts us about Preflight's traffic: stop scanning
that endpoint immediately, remove it from published data on request, and record
what happened in the repo. Being correctable is part of the boundary.
