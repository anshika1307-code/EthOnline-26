# Who built this, and how honest we're being about it

Full formal disclosure lives in [`AI_USAGE.md`](../../AI_USAGE.md) and
[`ATTRIBUTION.md`](../../ATTRIBUTION.md). This is the plain version.

## The short version

One person built this, solo, over one hackathon weekend, working closely
with an AI coding assistant (Claude Code, by Anthropic) as a pair-programmer.
Most of the actual code in this repository was typed by the AI. The idea,
the direction, the judgment calls, and(importantly) catching the AI's
mistakes before they became false claims, were the human's job.

We're not going to soften that. If you're judging this project's "meaningful
human contribution," here's exactly where the line falls.

## What the human did

- **Had the idea, and rewrote it twice.** The project went through three
  versions before landing on its current shape, starting as "is this agent
  alive," and only becoming "is it safe to pay this endpoint" after the
  second rewrite. That reframing is the entire product, and it didn't come
  from the AI.
- **Set the ethics boundary.** The rule that adversarial checks never touch
  a stranger's live service, and the decision to enforce that in code rather
  than just promise it, those were deliberate calls, not defaults.
- **Chose what to build and what to cut**, including which sponsor
  integrations to pursue and which to drop under a tight deadline.
- **Caught the AI being wrong**, repeatedly, before it shipped. See below.

## What the AI wrote

Essentially all of the implementation: the registry scanner, the checks, the
report renderer, the test services, the paid API, the dashboard, and the
automated tests, plus most of the prose in the technical docs. That's a
straightforward statement of fact, not something being minimized.

## The mistakes we caught, because "AI wrote it" isn't the same as "AI got it right"

These are recorded honestly because a project about *trustworthiness* has no
business hiding its own near-misses:

1. **It proposed a 0–100 "trust score."** We explicitly didn't want that,
   a made-up number invites false confidence, and a competitor already
   ships one. We wanted evidence, not a score. Replaced with plain-language
   verdicts.
2. **It once labeled things "SAFE" without ever actually paying them.**
   "Safe to pay" shouldn't be claimable without actually completing a real
   payment and confirming delivery, that was a real bug that would have
   over-promised safety, and it's now locked behind an automated test so it
   can't silently regress.
3. **A "response time" measurement that was secretly just our own
   timeout,** not the real speed of the thing being measured, caught and
   fixed.
4. **A payment amount printed in a report that was never actually paid**,
   it was printing our own spending limit instead of the real transaction
   amount. Fixed to only ever report what was actually observed.
5. **A dashboard that claimed to hide people's identifying details while
   actually still showing them** in one spot. Caught and fixed before it
   shipped.
6. **A silent compatibility bug** between two versions of the payment
   protocol that made one of our own test services *stop* demonstrating the
   security flaw it existed to demonstrate, without any error message
   telling us so. We only noticed because two separate checks contradicted
   each other, and chasing that contradiction found the bug. It turned into
   a real bug-fix contribution filed against Hedera's own tooling.

## Why this matters here specifically

This project's whole pitch is "don't just trust a service, check it and
show your evidence." It would be a little embarrassing to make that pitch
and then hide our own working process. So we didn't: every planning
document, every rewrite of the idea, and every one of the corrections above
is kept in the project's history rather than cleaned up after the fact.
