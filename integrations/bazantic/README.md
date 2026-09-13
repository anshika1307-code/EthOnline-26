# Preflight on Bazantic

**Recipe: "Should my agent pay this x402 endpoint"**

An agent is about to pay an x402 API it's never used. It hands the URL to
this recipe and gets back one of `PAY`, `PAY_WITH_SMALL_CAP`, `DO_NOT_PAY`,
or `CANNOT_VERIFY_PAYEE`, the reasons why, and the most it should spend.

It takes two services working together, because neither can answer this
alone:

| | Knows | Can't know |
|---|---|---|
| **Preflight** (our API) | whether the endpoint answers, whether its quote is well-formed, *which account it wants paid, on which network* | whether that account actually exists or can receive money |
| **Hedera mirror node** (sponsor API) | everything about an account on the ledger | which account a given URL even wants paid, or whether the URL works at all |

**The case that proves it needs both:** our test route `/bad-payee` returns
a perfectly valid quote. Preflight alone passes it, `UNKNOWN`, not unsafe,
just "haven't seen a payment complete yet." But the account it wants paid,
`0.0.999999999`, doesn't exist on Hedera testnet at all. Only the mirror
node can tell you that, and only once Preflight has pulled the account ID
out of the quote for it to look up.

## How information moves through the recipe

```
endpoint URL
   │
   ▼
Preflight check ──► verdict, quote, which account it wants paid, on which network
   │
   ├─ dead / broken / no quote ─────────────────────► DO_NOT_PAY   (mirror node never called)
   ├─ payee isn't on Hedera testnet ────────────────► CANNOT_VERIFY_PAYEE
   │
   ▼ testnet payee → testnet mirror node only
does the account exist / can it receive? ──► no ────► DO_NOT_PAY
has it ever been paid before? ──► age of first payment
   │
   ▼
brand new or never paid ──► PAY_WITH_SMALL_CAP     otherwise ──► PAY
```

The maximum payment suggested is always the quoted amount, never more.

### The trap this recipe exists to avoid

Bazantic's existing Hedera mirror-node connector reads **mainnet**. Our
test accounts are on **testnet**. Account numbers aren't unique across the
two, `0.0.10475917` is a real, unrelated account on both networks
(checked 13 Sep 2026):

| network | created | balance |
|---|---|---|
| testnet (our receiver) | recent | 100,019,520,000 tinybar |
| mainnet (someone else entirely) | 4+ months earlier | 69,737,293 tinybar |

An agent that looked our testnet payee up on mainnet would find a real,
funded, unrelated account and wrongly call the seller verified.

**A prompt alone didn't prevent this.** Our first draft connected both
mirror-node lookups and told the model to pick the right one by network. In
one real test run, the model announced "looking up payee on testnet" and
then actually queried mainnet, it got it right in an earlier run with the
same prompt, so it was luck, not a real safeguard. The fix was removing the
*possibility* of the mistake: we only ever connect the testnet lookup, so a
mainnet payee simply can't be checked at all rather than checked against
the wrong ledger. **Lesson: if two connected tools share a name, don't
count on the model to always tell them apart, remove the ambiguity
instead.**

**A missing-account error also used to abort the whole recipe.** Looking up
the missing payee with the wrong lookup method returned a 404, and Bazantic
treated that as a failure instead of "this account doesn't exist", an
answer the recipe actually needs. Switched to a lookup method that returns
an empty list instead of an error for a missing account.

## What's actually live

| Gateway | Slug | URL |
|---|---|---|
| Preflight (ours) | `yxyem37kg5ffdbiksreq54z2mq` | `https://yxyem37kg5ffdbiksreq54z2mq.bazgateway.com`, `POST /gw/check` $0.002, `POST /gw/liveness` $0.0008, paid in USDC on Base |
| Hedera testnet mirror node (ours) | `z3xelbmspbemzdfw3ufuo3pteq` | `https://z3xelbmspbemzdfw3ufuo3pteq.bazgateway.com`, accounts, transactions, tokens, $0.0005 each |
| Hedera mirror node, mainnet (Bazantic's) | `xmtqdss7cbddlchc7s3sfdb4b4` | **not connected**, see the trap above |

## What's in this folder

| File | What it is |
|---|---|
| `recipe.template.json` | The recipe itself |
| `build-recipe.mjs` | Fills in the gateway slugs and checks the file's format |
| `reference-run.ts` | The same flow in plain code, against the real services, used as the source of truth the recipe is tested against |
| `TEST_PLAN.md` | Test cases, expected results, and how to compare |

Supporting code: [apps/api/src/gateway.ts](../../apps/api/src/gateway.ts)
(the routes Bazantic imports),
[packages/checks/src/payee.ts](../../packages/checks/src/payee.ts) (the
decision rules the recipe encodes, unit-tested), and
[testbed/src/server.ts](../../testbed/src/server.ts) (`/bad-payee`).

## Why Preflight needs a second front door

Bazantic's gateway charges the agent in USDC and calls our API with a
shared credential, it can't pay our Hedera-based route directly. So the
API also exposes `/gw/check` and `/gw/liveness`, authenticated by a shared
key, running the exact same check logic as everything else. Same rules
apply: passive checks only, private/internal targets refused, one endpoint
per call.

## Setup

**1. API environment on Render** (then redeploy): set
`BAZANTIC_UPSTREAM_KEY` to the output of `openssl rand -hex 32`, and
`PUBLIC_URL` to `https://ethonline-26.onrender.com`.

Confirm it's live, the spec is public, the check itself is not:

```bash
curl -s https://ethonline-26.onrender.com/gw/openapi.json | jq '.paths | keys'   # ["/gw/check","/gw/liveness"]
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ethonline-26.onrender.com/gw/check   # 401
```

**2. Test services**, redeploy so `/bad-payee` exists:

```bash
curl -s https://testbed-1l2m.onrender.com/health | jq .routes   # includes "POST /bad-payee"
```

**3. A Bazantic account** at bazantic.com. Note the username, the
submission needs it.

**4. Gateway: Preflight** (dashboard → Deploy a gateway)

| Field | Value |
|---|---|
| Base URL | `https://ethonline-26.onrender.com` |
| Spec | `https://ethonline-26.onrender.com/gw/openapi.json` |
| Auth | API key, as a Bearer token, value = `BAZANTIC_UPSTREAM_KEY` |
| Product website | `https://eth-online-26.vercel.app` |
| Docs | this repo's README |
| Prices | `POST /gw/check` $0.002 · `POST /gw/liveness` $0.0008 |
| Category | Monitoring |

**5. Gateway: Hedera testnet mirror node**

| Field | Value |
|---|---|
| Base URL | `https://testnet.mirrornode.hedera.com` |
| Spec | `https://testnet.mirrornode.hedera.com/api/v1/docs/openapi.yml` |
| Auth | none |
| Prices | $0.0005 each on account lookup, transactions, and account-tokens routes |

**6. Confirm the tool names** (free to check):

```bash
curl -s -X POST "<endpointUrl>/mcp" -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | sed -n 's/^data: //p' | jq -r '.result.tools[].name'
```

If the names differ from what `recipe.template.json` expects, update the
`tool_name` fields before building.

**7. Build and create the recipe**

```bash
TESTNET_MIRROR_SLUG=<26 chars> node integrations/bazantic/build-recipe.mjs
baz login
baz recipe create integrations/bazantic/recipe.json --json
```

**8. Test the draft** (free) against every case in
[TEST_PLAN.md](TEST_PLAN.md), then publish only once they all match:

```bash
baz recipe publish <handle> --json
```

**Before recording a demo:** hit both health endpoints first, free
hosting tiers sleep, and a cold test service will correctly (but
confusingly) report `DEAD`.

## Rough edges we hit building this

1. The gateway-manifest workflow described in Bazantic's docs
   (`baz gateway validate / plan / apply`) doesn't exist in the CLI,
   only `add`, `list`, `resync`, `domains` are available.
2. `gateway add` has no way to set an upstream secret, has to be finished
   in the dashboard.
3. The mirror-node gateway listing doesn't say which network it reads,
   which matters a lot here, account numbers collide across networks, so
   the ambiguity silently produces wrong answers instead of an error.
4. Recipe `model` values are only documented in `baz recipe --help`, not
   the docs site.
5. The dashboard briefly showed our MCP server as unreachable right after
   activation, even though it was already answering correctly.
6. A tool's HTTP 404 fails the entire recipe run, even when "not found" is
   exactly the answer the recipe needs, worked around with a list-style
   endpoint instead.
7. Recipes can't tell apart two bound gateways that expose a tool with the
   same name, one was silently routed to the wrong one.
8. Generated tools wrap a request body as `requestBody`, which isn't in
   the recipe docs and trips up a naive prompt.

## Submission notes

- **Best Recipe that uses EthGlobal Sponsor APIs**, the final decision
  genuinely depends on both services; see the `/bad-payee` case in
  `TEST_PLAN.md`, where Preflight alone says `UNKNOWN` and the combined
  answer is `DO_NOT_PAY`.
- **Agentify a new API**. Preflight wasn't previously on Bazantic and
  isn't a sponsor API. It's reusable beyond this one recipe: any agent can
  call it before paying any x402 seller, on any chain.
- Bazantic username: _fill in_
