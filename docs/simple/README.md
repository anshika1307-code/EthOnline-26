# Preflight, explained simply

## The story in one paragraph

Soon, AI agents will pay other AI agents for small jobs, a few cents for one
API call, no human, no signup, no credit card. This is already happening,
it's called **x402**. But here's the catch: if a robot is about to hand over
money to a stranger's API, it has no way to check first whether that API is
even alive, whether it will actually deliver what it promised, or whether it
will just take the money and vanish. There's no "read the reviews" button.
**Preflight is that check.** Point it at an endpoint before you pay it, and it
tells you(in plain language, backed by evidence) whether it looks **SAFE**,
whether you should be **CAUTIOUS**, whether it's flat-out **UNSAFE**, or
whether it's just **DEAD**.

Think of it like the checklist a pilot runs before takeoff. Nobody skips it
because "the plane looked fine yesterday."

## Try it right now

| | |
|---|---|
| See the dashboard | https://eth-online-26.vercel.app |
| Run a real check yourself | `POST https://ethonline-26.onrender.com/check` |
| Watch our own test agent decide who to trust | see below |

```bash
cd packages/checks && npx tsx src/bin/buyer-agent.ts https://testbed-1l2m.onrender.com/good
```

That one command is the whole loop: an agent looks itself up on-chain, finds
a service, pays for a Preflight check, reads the verdict, and decides whether
to pay the target, with a receipt of the whole thing written to a public,
tamper-proof log. Nothing in that sentence is hard-coded or faked.

## What we actually found when we checked

We didn't just build the checker, we ran it against every single agent
registered on-chain (via the ERC-8004 standard), all 10,249 of them, and
looked at what's really out there:

- **Only 85 of them** (less than 1%) even list a working web address.
- **Only 37** of those actually answer when you knock.
- **Only 5** are set up to actually accept a payment correctly.

So out of ten thousand registered "agents," five are currently ready to be
paid for something. And even those five don't all speak the same version of
the payment protocol, an agent built for the newer version literally cannot
pay four of those five, and gets no useful error telling it why.

We also found that a **single wallet owns 58%** of every agent ever
registered, and that public IPFS file-hosting, where a lot of agents store
their info, silently refuses a huge share of automated requests, which is
its own kind of unreliability nobody talks about.

None of this is guesswork. Every number here can be regenerated from raw
files in this repo with one command: `node scripts/verify-claims.mjs`.

## How Preflight decides

It runs a short list of checks, roughly in the order a cautious human would:

1. **Is it even alive?** (checked three separate times, so "dead once" isn't
   the same as "actually dead")
2. **Does it ask for a sane, well-formed price?**
3. **Does the price it quotes match what it claims to charge?**
4. **If you actually pay it, do you get anything back?** (this is the one
   that matters most: paying and getting nothing is the whole reason this
   project exists)
5. **Is the whole ecosystem quietly dependent on one dominant provider?**

There's a second, more aggressive set of checks, trying to replay a payment
twice to see if it lets you steal a free copy of the service, but **we only
ever run those against services we built and own ourselves.** We never
attack a stranger's live service to test it. That's a hard rule, and it's
enforced in the code itself, not just something we promise in a doc. See
[`how-it-works.md`](./how-it-works.md) for the full, honest breakdown of
every check and every limitation.

## The two sponsors this is built on

- **[Hedera →](./hedera.md)**, the actual payment rail. Every check we sell
  is paid for in real HBAR on Hedera testnet, and every completed check
  writes a receipt to a public, forgery-proof log on Hedera.
- **[Bazantic →](./bazantic.md)**, turns Preflight into a reusable tool any
  agent can call, and combines it with Hedera's own account-lookup service to
  catch a scam a payment-quote check alone would miss.

## Who built this, and how

One person, over one hackathon weekend, working closely with an AI
pair-programmer (Claude Code) that wrote most of the actual code under close
direction and review. Full honest accounting, including the mistakes the AI
made that had to be caught and fixed: [`credits-and-ai.md`](./credits-and-ai.md).

## Want the full technical detail?

This folder is the short version. Every claim here has a longer, evidence-
heavy write-up in the repo root: [`README.md`](../../README.md) is the
technical entry point, and it links out to the methodology, ethics rules,
and published dataset behind every number above.
