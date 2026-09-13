# Preflight on Bazantic

**Recipe: "Should my agent pay this x402 endpoint"**

An agent is about to pay an x402 API it has never used. It hands the URL to
this recipe and gets back one of `PAY`, `PAY_WITH_SMALL_CAP`, `DO_NOT_PAY` or
`CANNOT_VERIFY_PAYEE`, the reasons, and the most it should pay.

Two services, and the answer needs both:

| | knows | can't know |
|---|---|---|
| **Preflight** (our API, new on Bazantic) | whether the endpoint answers, whether its 402 quote is well-formed, *which account the quote pays and on which network* | whether that account exists, can receive, or has ever been paid |
| **Hedera mirror node** (sponsor API) | everything about an account on the ledger | which account a given URL wants paid, or whether the URL even works |

The case that shows it: our testbed's `/bad-payee` returns a perfectly valid
x402 v2 quote. Preflight passes it (P1 pass, P2 pass, verdict `UNKNOWN`). The
account it pays, `0.0.999999999`, doesn't exist on Hedera testnet. Only the
mirror node can tell you that, and it can only tell you once Preflight has
pulled the account id out of the quote.

## How information moves

```
endpoint URL
   │
   ▼
preflightCheckEndpoint ──► verdict, checks, quote, hederaPayTo {account, network}, checkedAtUnix
   │
   ├─ DEAD / CAUTION / no quote ─────────────────────────────► DO_NOT_PAY   (no mirror calls, no mirror spend)
   ├─ payee not on Hedera ───────────────────────────────────► CANNOT_VERIFY_PAYEE
   │
   ▼ pick the mirror node for hederaPayTo.network — never a different one
getAccount ──► missing / deleted / receiver_sig_required ────► DO_NOT_PAY
getTokensByAccountId (HTS quotes only) ──► can't receive ────► DO_NOT_PAY
getTransactions ──► incoming payments;  created_timestamp vs checkedAtUnix ──► age
   │
   ▼
new (< 7 days) or never paid ──► PAY_WITH_SMALL_CAP     otherwise ──► PAY
maxPayment is always the quoted amount, never more
```

### The trap this recipe exists to avoid

Bazantic's existing Hedera Mirror Node gateway reads **mainnet**. Our payees are
on **testnet**. Account ids are per network, and `0.0.10475917` exists on both
as two unrelated accounts (checked on 13 Sep 2026):

| network | created_timestamp | evm_address | balance (tinybar) |
|---|---|---|---|
| testnet (our receiver) | `1789131390.679512817` | `0x975e40d1…c125a6b0` | 100,019,520,000 |
| mainnet (someone else) | `1778617190.487475001` | `0x695f6c21…1297a173` | 69,737,293 |

An agent handed both tools and no guidance would look the testnet payee up on
mainnet, find a four-month-old funded account, and call the seller verified.
The recipe routes by `hederaPayTo.network` and refuses to cross-check. That is
why we added a testnet mirror gateway instead of reusing the mainnet one.

## Live gateways

| gateway | slug | URL |
|---|---|---|
| Preflight (ours) | `yxyem37kg5ffdbiksreq54z2mq` | https://yxyem37kg5ffdbiksreq54z2mq.bazgateway.com — `POST /gw/check` $0.002, `POST /gw/liveness` $0.0008, USDC on Base; MCP at `/mcp` |
| Hedera Testnet Mirror Node (ours) | `z3xelbmspbemzdfw3ufuo3pteq` | https://z3xelbmspbemzdfw3ufuo3pteq.bazgateway.com — accounts, transactions, account tokens at $0.0005, USDC on Base |
| Hedera Mirror Node, mainnet (Bazantic's) | `xmtqdss7cbddlchc7s3sfdb4b4` | https://xmtqdss7cbddlchc7s3sfdb4b4.bazgateway.com |

Checked 13 Sep 2026: the Preflight gateway's `tools/list` returns
`preflightCheckEndpoint` and `preflightLivenessCheck`, each taking the JSON body
as a `requestBody` argument, and an unpaid `POST /gw/check` returns 402 quoting
2000 USDC base units on `eip155:8453`. The testnet mirror gateway lists
`getAccount`, `getTransactions` and `getTokensByAccountId`; those three routes
quote 500 base units ($0.0005).

## What's in this folder

| file | what |
|---|---|
| `recipe.template.json` | the recipe, with a `${TESTNET_MIRROR_SLUG}` placeholder until that gateway exists |
| `build-recipe.mjs` | fills the slugs and checks the file against `baz recipe --help` rules (8 keys, model list, 24 KiB, slug format) |
| `reference-run.ts` | the same flow in code, against the real services — the oracle the recipe is tested against |
| `TEST_PLAN.md` | cases, expected results (from the oracle), and how to compare |

Supporting code:
- [apps/api/src/gateway.ts](../../apps/api/src/gateway.ts) — the upstream routes and OpenAPI spec Bazantic imports
- [packages/checks/src/payee.ts](../../packages/checks/src/payee.ts) — the decision rules the prompt encodes, unit-tested
- [testbed/src/server.ts](../../testbed/src/server.ts) — `/bad-payee`

## Why Preflight needs a second front door

Bazantic's gateway charges the agent (USDC over x402/MPP) and then calls the
upstream with a credential. It can't pay our Hedera x402 route. So the API has
`/gw/check` and `/gw/liveness`, authenticated by a shared key, running the
exact same check code (`apps/api/src/run-checks.ts`). Same abuse boundary:
passive checks only, private/loopback/metadata targets refused, one endpoint
per call because Bazantic prices per call. Pricing by depth is two methods at
two prices.

## Setup

**1. API env on Render** (then redeploy): `BAZANTIC_UPSTREAM_KEY` = output of
`openssl rand -hex 32`, `PUBLIC_URL` = `https://ethonline-26.onrender.com`.

Check it's live — the spec is public, the check is not:

```bash
curl -s https://ethonline-26.onrender.com/gw/openapi.json | jq '.paths | keys'   # ["/gw/check","/gw/liveness"]
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ethonline-26.onrender.com/gw/check   # 401
```

**2. Testbed** — redeploy so `/bad-payee` exists:

```bash
curl -s https://testbed-1l2m.onrender.com/health | jq .routes   # includes "POST /bad-payee"
```

**3. Bazantic account** at bazantic.com. Note the username (email or GitHub) — the submission needs it.

**4. Gateway: Preflight** (dashboard → Deploy a gateway)

| field | value |
|---|---|
| Base URL | `https://ethonline-26.onrender.com` |
| Spec | `https://ethonline-26.onrender.com/gw/openapi.json` |
| Auth | API key, delivered as **Bearer token**, value = `BAZANTIC_UPSTREAM_KEY` |
| Product website | `https://eth-online-26.vercel.app` |
| Docs | the repo README |
| Prices | `POST /gw/check` $0.002 · `POST /gw/liveness` $0.0008 |
| Category | Monitoring |

**5. Gateway: Hedera Testnet Mirror Node**

| field | value |
|---|---|
| Base URL | `https://testnet.mirrornode.hedera.com` |
| Spec | `https://testnet.mirrornode.hedera.com/api/v1/docs/openapi.yml` |
| Auth | none |
| Prices | $0.0005 on `GET /api/v1/accounts/{idOrAliasOrEvmAddress}`, `GET /api/v1/transactions`, `GET /api/v1/accounts/{idOrAliasOrEvmAddress}/tokens`. Disable the rest if the review screen lets you |

**6. Confirm tool names** (free — `tools/list` costs nothing). Get each
`endpointUrl` from `baz gateway list --json`, never build it by hand:

```bash
curl -s -X POST "<endpointUrl>/mcp" -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | sed -n 's/^data: //p' | jq -r '.result.tools[].name'
```

Preflight must list `preflightCheckEndpoint`; the testnet mirror must list
`getAccount`, `getTransactions`, `getTokensByAccountId`. If Bazantic renamed
them, fix `tool_name` in `recipe.template.json` before building.

**7. Build and create the recipe**

```bash
TESTNET_MIRROR_SLUG=<26 chars> node integrations/bazantic/build-recipe.mjs
baz login
baz recipe create integrations/bazantic/recipe.json --json
```

Or paste the fields from `recipe.json` into the dashboard recipe editor.

**8. Test the draft** in the dashboard (draft runs are free) with every case in
[TEST_PLAN.md](TEST_PLAN.md). Publish only when they match:

```bash
baz recipe publish <handle> --json
```

**Before recording:** hit `https://testbed-1l2m.onrender.com/health` and
`https://ethonline-26.onrender.com/health` first. Both are free Render
instances that sleep; a cold testbed makes Preflight report `DEAD`, correctly,
because it didn't answer in time.

## Friction we hit (for Bazantic)

1. **The manifest workflow in the docs isn't in the CLI.** `/docs/gateway-manifest`
   documents `baz gateway validate / plan / apply`. With `@bazantic/cli@0.10.1`
   (published 12 Sep 2026):
   ```
   $ baz gateway validate
   baz: unknown gateway command: validate. Try `baz gateway --help`.
   ```
   `baz gateway --help` lists only `add`, `list`, `resync`, `domains`.
2. **`gateway add` can't set an upstream secret.** `--auth-type api-key` exists,
   but there's no flag for the key or its delivery, so an authenticated
   upstream has to be finished in the dashboard.
3. **The mirror node listing doesn't say which network it reads.** The
   description says "mainnet, testnet, and previewnet"; the provider link is
   `mainnet-public.mirrornode.hedera.com`. Because account ids collide across
   networks, that ambiguity silently produces wrong answers rather than errors.
4. **Recipe `model` values** aren't on `/docs/recipes`; they're only in
   `baz recipe --help`.
5. **The dashboard showed the MCP server as "UNAVAILABLE — Gateway unreachable"**
   right after activation, while `POST <gateway>/mcp` `tools/list` already
   answered 200 with both tools.
6. **Generated tools wrap a JSON body as `requestBody`.** Reasonable, but not in
   the recipe docs, and a prompt that says "call with `{endpoint}`" gets it wrong.

## Submission notes

- **Best Recipe that uses EthGlobal Sponsor APIs** — Preflight + Hedera mirror
  node (Hedera is a sponsor). The final decision depends on both: see the
  `/bad-payee` row in TEST_PLAN.md, where Preflight alone says `UNKNOWN` and
  the combined answer is `DO_NOT_PAY`.
- **Agentify a new API** — Preflight wasn't on Bazantic and isn't a sponsor
  API. It's reusable beyond this recipe: any agent can call
  `preflightCheckEndpoint` before paying any x402 seller, on any chain.
- Bazantic username: _fill in_
