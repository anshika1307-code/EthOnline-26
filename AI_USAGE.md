# AI usage

ETHGlobal requires that AI use is disclosed, that AI **assists** rather than
authors the project, and that a spec-driven workflow ships its spec files,
prompts and planning artifacts in the repo. This file is that disclosure.

## Tool

**Claude Code** (Anthropic), used as a pair-programmer throughout, in a single
continuous session. No other AI tooling.

## Honest summary

This project is **heavily AI-assisted**. Most of the code in this repo was
written by Claude Code at my direction, in a back-and-forth where I set the
goal, chose between options it put up, redirected it when it went wrong, and
made the judgement calls that decide what the project actually claims.

I am not going to understate that. What follows is where the line falls.

## What the AI wrote

| Area | Files |
|---|---|
| Registry scanner | `packages/registry/src/fetch-agents.ts` |
| Check suite (P1–P5, A1) | `packages/checks/src/**` |
| Report renderer | `packages/checks/src/report.ts` |
| Testbed | `testbed/src/server.ts` |
| Paid API | `apps/api/src/server.ts` |
| Dashboard | `src/app/page.tsx`, `src/lib/data.ts` |
| Tests | `packages/checks/src/**/*.test.ts` |
| Most prose in the docs | `METHODOLOGY.md`, `ETHICS.md`, `ROADMAP.md`, `IMPLEMENTATION_PLAN.md`, `rules.md` |

## What was mine

The direction, and the decisions that change what the project asserts:

- **The idea and its three versions.** `agent-readiness-checker-brief.md` (v1),
  `roll-call-brief-v2.md` (v2) and `preflight-brief-v3.md` (v3) are the spec.
  The reframe from "is this agent alive" to "is it safe to pay this endpoint"
  is the whole project, and it is mine.
- **The ethics boundary** (`ETHICS.md` §1) — the Group P / Group A split, and
  the rule that adversarial checks never touch a third party.
- **Sponsor and scope choices** — which prizes to chase, what to cut.
- **Rejecting the AI's suggestions when they were wrong.** Several of the
  corrections below were prompted by me pushing back on output that looked
  fine.

## Corrections I had to make

Recorded because "AI wrote it" is not the same as "AI got it right", and these
are the moments the project would have shipped something false without review:

1. **A 0–100 readiness score.** The AI proposed one. v3 §3 and §8 explicitly
   reject a rival reputation score — QuickNode already ships one, and we report
   findings, not opinions. Cut, replaced with verdict bands.
2. **`SAFE` awarded without paying.** The first report labelled four
   third-party agents SAFE on liveness alone. "Safe to pay" cannot be asserted
   without attempting payment. Now `SAFE` requires P4 to have passed; a test
   locks it.
3. **A latency figure that measured our own timeout.** P1 reported
   `median 10004ms` — our 10s abort while draining SSE streams that never
   close. Real figure is 305–1214ms.
4. **A published amount we never observed.** P4 printed our spend cap as the
   amount paid. Now taken from the requirements actually signed.
5. **An anonymisation claim the page contradicted.** The dashboard said hosts
   were anonymised while rendering `mesh.heurist.xyz`.
6. **The v1/v2 x402 header.** `X-PAYMENT` vs `PAYMENT-SIGNATURE` silently made
   our "vulnerable" testbed endpoint behave correctly. Caught only because a
   check contradicted itself. This became the Hedera Harness PR.

## Spec-driven artifacts in the repo

Per the event rules, the planning artifacts ship here:

- `agent-readiness-checker-brief.md`, `roll-call-brief-v2.md`,
  `preflight-brief-v3.md` — the specs, v1 → v3
- `preflight-prize-menu-and-comparison.md` — sponsor analysis and version diff
- `ROADMAP.md`, `IMPLEMENTATION_PLAN.md`, `rules.md` — plan, build order,
  constraints
- `METHODOLOGY.md` — how every number was produced
- `HEDERA_FEEDBACK.md` — friction log written live
- `data/**` — every raw scan, liveness round and report

The full prompt-by-prompt transcript is a Claude Code session and is not
committed; the briefs above are the specs that drove it.

## Can I explain it?

Yes — that is the bar the rules set, and it is the right one. The design
decisions worth defending in Q&A are: the P/A split and why the guard is code
rather than a comment; why `SAFE` requires a settled payment; why the paid API
refuses to run Group A at any price; why P3 skips instead of guessing a price
from prose; and why the IPFS circuit breaker is honest rather than a shortcut.
