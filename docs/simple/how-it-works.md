# How Preflight actually decides, and the rules it holds itself to

The full technical detail lives in [`METHODOLOGY.md`](../../METHODOLOGY.md)
(exactly how each check works, byte for byte) and
[`ETHICS.md`](../../ETHICS.md) (the boundary and how it's enforced in code).
This page is the plain-English version of both.

## The checks, like a pilot's checklist

**Group P, the "look, don't touch" checks.** Safe to run against literally
anyone's live service, because they're what an ordinary customer does
anyway: send a normal request, and see what comes back.

| | Checks for | In plain words |
|---|---|---|
| **Liveness** | Is it dead? | We ping it three separate times, so "didn't answer once" isn't reported as "dead", a flaky connection and a dead service are different findings. |
| **Quote validity** | Is the price request well-formed? | Does it ask for payment the right, standard way, or is the "pay me" message broken/missing? |
| **Price consistency** | Does the price match what's advertised? | If it says "$0.01" somewhere and then asks for $0.10, that's a mismatch worth flagging. |
| **Delivery** | Do you get what you paid for? | **This is the one that matters most.** We make one real, ordinary payment and check whether the thing we paid for actually comes back. Paying and getting nothing is the entire reason this project exists. |
| **Discovery concentration** | Is everyone secretly using one provider? | If "pick a random agent from the registry" quietly means "use this one specific company" 80% of the time, that's worth knowing. |

**Group A, the "try to break it" checks.** These are deliberately
adversarial, for example, trying to reuse the same payment proof twice to
see if a service will let you get double service for one payment (a "replay
attack"). **We only ever run these against test services we built and own
ourselves.** Never against a stranger's live service.

## Why that line exists, and why it isn't optional

Trying to break into someone's website to see if it's breakable is, bluntly,
unauthorized testing, even when your intentions are good. Academic security
papers get to do this under formal responsible-disclosure agreements. We
don't have one of those with the thousands of agents in the registry, so we
don't get to borrow that permission.

So the rule is simple: **adversarial checks only ever touch things we own.**
And we didn't just write that rule in a document and hope it holds, it's
enforced by the code itself. Every adversarial check calls a guard function
first (`assertOwnTestbase()`), and that function refuses to run against any
address that isn't on our own pre-approved list. There's even an automated
test proving that pointing it at a stranger's address makes it refuse. The
paid version of the product can't run these checks *at any price*, on
purpose.

Other things we hold ourselves to:

- **We identify ourselves.** Every request carries a label saying who we
  are and linking back to this project, so if anyone wants to ask us to
  stop, they can find us.
- **We back off immediately** if anything looks like a refusal signal.
- **We report facts, not accusations.** "Paid, got back an error, no
  content", never "this agent is a scam." A failing check is a
  measurement, not a verdict on someone's character, and something that
  fails today might be fixed tomorrow.
- **We never publish a number we can't reproduce.** Every statistic in this
  project traces back to a raw file anyone can re-check.
- **Strangers can never be rated "SAFE."** Because "safe to pay" requires
  actually completing a payment, and we only ever pay our own test
  services. The most a stranger's endpoint can score is "caution", that's
  not a limitation we're hiding, it's a direct, intentional consequence of
  not testing real people's money without their consent.

## What we found when we pointed this at the real world

We scanned **every single agent** registered on-chain under the ERC-8004
standard(not a sample, all 10,249 of them) and actually tried contacting
each one's declared service.

- **85 (0.83%)** list something that looks like a real, working web address.
- **37 (0.36%)** actually answer when contacted.
- **5 (0.05%)** are properly set up to accept a payment.

And those five aren't even mutually compatible, three different agents use
an older version of the payment protocol and two use a newer one, and the
two versions don't understand each other's requests at all. A buyer built
for the new version silently can't pay sellers on the old one, with no
helpful error explaining why.

We also found that a **single wallet address owns 58%** of every agent ever
registered, so "10,249 independent AI agents" is, in practice, mostly one
or two large operators registering many entries. And roughly **three
quarters of all registered agents** have published metadata that literally
says "I offer nothing" (an empty services list), registration, it turns
out, is much easier than actually running something.

Every one of these numbers is reproducible from raw scan files in this repo
, see [`docs/findings.md`](../../docs/findings.md) for the full published
dataset and how to re-run the scan yourself.

## We also show our own mistakes

While building this, our own checks were occasionally wrong, and we kept
every one of those mistakes documented rather than quietly fixing them and
moving on, because a tool that measures other people's reliability should be
honest about its own. A few examples: we once measured "response time" that
was actually just our own 10-second timeout, not the real speed of the
service being checked; and our first payment-quote checker only understood
one version of the payment protocol, so it briefly and wrongly reported four
perfectly working services as "broken." Every one of those corrections, six
of them in total, is documented in
[`credits-and-ai.md`](./credits-and-ai.md) and
[`METHODOLOGY.md`](../../METHODOLOGY.md), because "we caught our own bug
before publishing it" is itself part of being trustworthy.
