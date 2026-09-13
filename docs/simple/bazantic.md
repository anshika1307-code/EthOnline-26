# Preflight on Bazantic — a plain-English walkthrough

*For the Bazantic judging team. Every claim below links to a live gateway, a
real test case, or real code — nothing here is a mockup.*

## The one-sentence version

**We built a recipe that answers "should my agent pay this endpoint" by
combining two services — our own Preflight checker and Hedera's own
account-lookup service — because neither one alone can catch every scam, and
we can prove it with a specific fake endpoint that fools one but not both.**

## What Bazantic actually does, for anyone new to it

Bazantic lets you wrap an API behind a pay-per-call gateway, and then write a
"recipe" — a reusable, tested instruction sheet that tells an AI agent
*exactly* when and how to use that API, instead of hoping the agent figures
it out from a raw API spec. We used both features.

## The story: why one checker isn't enough

Imagine a scammer sets up a fake paid API. It looks completely legitimate —
it answers correctly, and it quotes a proper-looking price to pay. Preflight,
checking only "does this thing behave correctly," would say **UNKNOWN** — not
unsafe, just "haven't seen it complete a real payment yet." That's an honest
answer, but it's not the whole picture.

Here's the piece Preflight alone can't see: **which account does that quote
actually want the money sent to — and does that account even exist?**
That's a question only Hedera's own mirror node (its official ledger lookup
service) can answer. So we built a recipe where the two work together:

```
1. Ask Preflight: does the endpoint behave correctly, and who does it want paid?
2. Ask Hedera's mirror node: does that account actually exist and can it receive money?
3. Combine both answers into one final verdict: PAY / PAY_WITH_SMALL_CAP / DO_NOT_PAY
```

### The proof: a fake endpoint that only the combination catches

We built a test endpoint, `/bad-payee`, that returns a completely
well-formed, correct-looking payment request — except it asks to pay an
account, `0.0.999999999`, that doesn't exist at all.

- **Preflight alone** says: "looks fine" → `UNKNOWN`
- **Preflight + Hedera mirror node together** says: "that account doesn't
  exist" → **`DO_NOT_PAY`**

That's the whole point of the recipe in one test case, and it's real,
runnable code — see [`integrations/bazantic/TEST_PLAN.md`](../../integrations/bazantic/TEST_PLAN.md).

## A mistake we caught (and why it matters for anyone else building this)

Account numbers on Hedera aren't globally unique — the *same* account number
can exist on both Hedera's test network and its real network, as two
completely unrelated accounts. We checked, and `0.0.10475917` really does
exist on both, with different balances and different owners.

Our first draft let the AI agent choose which network to look up on its own,
based on the wording of its instructions. In one test run, it announced "now
checking the test network" — and then actually queried the real network by
mistake. It worked correctly in an earlier run and failed silently in this
one: **pure luck, not a working safeguard.**

The fix wasn't a better prompt — it was removing the *possibility* of the
mistake entirely. We now only ever connect the recipe to the test-network
lookup service; the real-network one is never even wired in. A payee on the
wrong network simply can't be checked at all, rather than being checked
against the wrong ledger. The lesson we took from this: **if a mistake is
possible, assume it will eventually happen — don't rely on instructions
alone to prevent it.**

## What's actually live

| Gateway | What it does | Where |
|---|---|---|
| Preflight (ours) | Runs the safety check | `https://yxyem37kg5ffdbiksreq54z2mq.bazgateway.com` |
| Hedera Testnet Mirror Node (ours) | Looks up whether an account is real | `https://z3xelbmspbemzdfw3ufuo3pteq.bazgateway.com` |

Both are wrapped as pay-per-call services on Bazantic and combined inside one
recipe, so an agent can call `preflightCheckEndpoint` on any x402 seller, on
any chain, before it ever risks a payment.

## What this satisfies

- **Best Recipe that uses EthGlobal Sponsor APIs** — the recipe genuinely
  needs both services to reach its final answer; Hedera is one of the
  sponsor APIs it combines with.
- **Agentify a new API** — Preflight wasn't previously on Bazantic and isn't
  a sponsor API itself, so bringing it onto the platform is a new, reusable
  service any other builder's agent can now call.

## Everything above, as raw evidence

| What | Where |
|---|---|
| The recipe itself | [`integrations/bazantic/recipe.template.json`](../../integrations/bazantic/recipe.template.json) |
| Test cases and expected results | [`integrations/bazantic/TEST_PLAN.md`](../../integrations/bazantic/TEST_PLAN.md) |
| The decision logic, unit-tested | [`packages/checks/src/payee.ts`](../../packages/checks/src/payee.ts) |
| The gateway routes / OpenAPI spec | [`apps/api/src/gateway.ts`](../../apps/api/src/gateway.ts) |
| The fake endpoint used in the proof | [`testbed/src/server.ts`](../../testbed/src/server.ts) (`/bad-payee`) |
| Full technical write-up, including other rough edges we hit | [`integrations/bazantic/README.md`](../../integrations/bazantic/README.md) |
