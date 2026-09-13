# Preflight test services

Three x402-gated endpoints we own, deliberately built to behave
differently, so the scanner can show it separating good from bad, on
camera.

| Route | Behavior | Scanner should say |
|---|---|---|
| `POST /good` | Checks the payment proof properly, settles, delivers | **SAFE** |
| `POST /bad-replay` | Accepts the same payment proof more than once | **UNSAFE** (replay) |
| `POST /bad-delivery` | Takes the payment, then returns an error with nothing delivered | **UNSAFE** (delivery) |

**These are the only hosts our aggressive checks are allowed to run
against.** If you deploy this yourself, register the hostname in
`OWN_TESTBED_HOSTS` (`packages/checks/src/guard.ts`), see
[`../ETHICS.md`](../ETHICS.md).

This is one Express app with three routes rather than three separate
services, functionally identical for the demo (each behavior still has its
own URL), but one deploy instead of three.

## Setup

```bash
cd testbed
npm install
cp .env.example .env    # fill in from the Hedera Portal
npm run dev
```

You'll need **two funded Hedera testnet accounts** (a payer and a
receiver), with **ECDSA** keys, `0x`-prefixed.

## One import gotcha worth knowing

Don't import `@hiero-ledger/sdk` directly, `@x402/hedera` already re-exports
everything you need from it (`AccountId`, `Client`, `PrivateKey`, etc.).
Importing both causes a duplicate install that breaks at runtime with a
confusing `t.startsWith is not a function` error. Documented in the
package's own README, but easy to miss, and genuinely nasty to debug.

## Amounts

HBAR is `asset: "0.0.0"`, and amounts are in **tinybars**: 1 HBAR =
10^8 tinybars. `PRICE_TINYBAR=1000000` means 0.01 HBAR.

## One URL to get right

Blocky402's prize-page link points at `https://blocky402.com/`, that's
just the marketing site, not the API, and pointing `FACILITATOR_URL` at it
causes every gated route to fail. The real API bases are:

| Network | Base URL |
|---|---|
| `hedera:testnet` | `https://api.testnet.blocky402.com` ← what we use |
| `hedera:mainnet` | `https://api.blocky402.com` |

More detail in [`../HEDERA_FEEDBACK.md`](../HEDERA_FEEDBACK.md).
