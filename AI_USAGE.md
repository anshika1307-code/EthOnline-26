# AI usage

ETHGlobal requires disclosing AI use, requires that AI **assist** rather
than **author** a project, and requires a spec-driven workflow to ship its
planning artifacts. This is that disclosure.

## The tool

**Claude Code** (Anthropic), used as a pair-programmer throughout, in one
continuous session. No other AI tooling.

## The honest summary

This project is **heavily AI-assisted**. Most of the code here was written
by Claude Code at my direction — I set the goal, chose between the options
it offered, redirected it when it went wrong, and made the calls that
decide what this project actually claims. I'm not going to understate that.
Here's exactly where the line falls.

## What the AI wrote

| Area | Files |
|---|---|
| Registry scanner | `packages/registry/src/fetch-agents.ts` |
| The check suite (P1–P5, A1) | `packages/checks/src/**` |
| Report renderer | `packages/checks/src/report.ts` |
| Test services | `testbed/src/server.ts` |
| Paid API | `apps/api/src/server.ts` |
| Dashboard | `src/app/page.tsx`, `src/lib/data.ts` |
| Tests | `packages/checks/src/**/*.test.ts` |
| Most of the prose in the docs | `METHODOLOGY.md`, `ETHICS.md`, and the planning briefs |

## What was mine

The direction, and every decision that changes what this project actually
asserts:

- **The idea, rewritten twice.** The project went through three versions
  before landing here. The reframe from "is this agent alive" to "is it
  safe to pay this endpoint" is the whole project, and it's mine.
- **The ethics boundary** — the passive/active split, and the rule that
  aggressive checks never touch a stranger's live service.
- **Which sponsors and features to pursue**, and what to cut under time
  pressure.
- **Catching the AI when it was wrong.** Several corrections below started
  with me pushing back on output that looked fine at a glance.

## Mistakes I had to catch

Recorded because "the AI wrote it" isn't the same as "the AI got it right,"
and these are the moments this project would have shipped something false
without a second look:

1. **A 0–100 "readiness score."** The AI proposed one. I didn't want it —
   a competitor already ships a reputation number, and I wanted to report
   evidence, not an opinion. Cut, replaced with plain verdicts.
2. **`SAFE` awarded without ever actually paying.** An early report labeled
   four third-party agents "safe" on liveness alone. "Safe to pay" can't be
   claimed without attempting a payment — now `SAFE` requires a completed
   one, and a test locks that in.
3. **A "response time" that was secretly our own timeout** — some agent
   connections never close, and we were measuring how long we waited to
   give up, not how fast the agent actually responded.
4. **A published payment amount we never actually observed** — an early
   version printed our own spending cap instead of the real amount paid.
5. **A dashboard that claimed to hide identifying details while still
   showing one.** Caught before it shipped.
6. **A silent protocol-version bug.** One payment header name changed
   between protocol versions, and it quietly made our own "vulnerable" test
   endpoint stop being vulnerable — with zero error message. I only caught
   it because two checks contradicted each other. This became a real
   pull request against Hedera's own tooling.

## The planning trail

Per the event's rules, a spec-driven workflow should be traceable — this
project's actual specs, in order, are the version-1 through version-3
briefs (the reframe from "is it alive" to "is it safe to pay" happened
across them), plus a roadmap, an implementation plan, and a project rules
file. The full prompt-by-prompt session isn't committed; these documents
are the specs that actually drove the build, kept so the decisions can be
traced rather than reconstructed after the fact.

## Can I explain it?

Yes — that's the actual bar, and it's the right one. The decisions worth
defending in a Q&A: why the ethics guard is code and not just a comment;
why `SAFE` requires a settled payment; why the paid API refuses to run
aggressive checks at any price; why the price-match check skips instead of
guessing; and why the IPFS failure handling is honest about what it
couldn't read instead of quietly hiding it.
