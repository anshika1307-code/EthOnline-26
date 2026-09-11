# Preflight testbed

Three x402-gated endpoints we own, deliberately behaving differently, so the
scanner can be shown separating good from bad on camera. This is the demo
(`preflight-brief-v3.md` §5) and the integration-test rig
(`IMPLEMENTATION_PLAN.md` §7.2).

| Route | Behaviour | Scanner should say |
|---|---|---|
| `POST /good` | Verifies the payment proof, checks the nonce, settles, delivers | **SAFE** |
| `POST /bad-replay` | Accepts the same payment proof repeatedly — no nonce check | **UNSAFE** (A1 replay) |
| `POST /bad-delivery` | Takes the payment, settles it, then returns 500 with no resource | **UNSAFE** (P4 delivery) |

**These are the only hosts Group A checks may run against.** Register this
deploy's hostname in `OWN_TESTBED_HOSTS` (`packages/checks/src/guard.ts`).
See `ETHICS.md`.

## Deviation from the brief

v3 §5 says "three small Express services." This is **one** Express app with
three routes. Functionally identical for the demo — each behaviour still has
its own URL — but one deploy instead of three, and one hostname to allowlist.
On a 2-day clock that trade is worth it.

## Setup

```bash
cd testbed
npm install
cp .env.example .env    # fill in from the Hedera Portal
npm run dev
```

You need **two funded Hedera testnet accounts** (payer and receiver) — see the
account steps in `ROADMAP.md` Block 0. Keys must be **ECDSA**, `0x`-prefixed.

## Important: do not import `@hiero-ledger/sdk` directly

`@x402/hedera` re-exports the SDK primitives it needs (`AccountId`, `Client`,
`PrivateKey`, `Hbar`, `TransferTransaction`, …). Import them **from
`@x402/hedera`**. Importing `@hiero-ledger/sdk` alongside it produces duplicate
on-disk installs, and the SDK's internal brand checks then throw
`t.startsWith is not a function` at runtime. This is documented in the
package README and is a genuinely nasty one to debug.

## Amounts

HBAR is `asset: "0.0.0"` and amounts are in **tinybars**: 1 HBAR = 10^8
tinybars. `PRICE_TINYBAR=1000000` is 0.01 HBAR.

## Facilitator URL — read this before you change it

The Hedera prize page links Blocky402 as `https://blocky402.com/`. **That is the
marketing site, not the API.** Pointing `FACILITATOR_URL` at it gives a 404 with
a Next.js page in the error and every gated route then 500s. The API bases are:

| Network | Base URL |
|---|---|
| `hedera:testnet` | `https://api.testnet.blocky402.com` ← what we use |
| `hedera:mainnet` | `https://api.blocky402.com` (mainnet only) |

Logged in `HEDERA_FEEDBACK.md`.

## Status

Built against the verified `@x402/core` / `@x402/hedera` / `@x402/express`
2.25.0 API and **run**, not just typechecked:

- ✅ boots and syncs supported kinds from the testnet facilitator
- ✅ `POST /good` with no payment returns a spec-valid `HTTP 402` with a
  well-formed `PAYMENT-REQUIRED` header (x402Version 2, `hedera:testnet`,
  amount in tinybars, asset `0.0.0`, our `payTo`)
- ✅ auto-discovers the facilitator's fee payer (`0.0.7162784`) — no config
- ⬜ **not yet: an actual settled payment.** That needs the client side
  (the P4 delivery check in `packages/checks`), which is the next task.

Until a payment settles, `/bad-replay` and `/bad-delivery` cannot be
distinguished from `/good` — they all just return 402.
