# Recipe test plan

The recipe is a prompt, so it can drift from what it's supposed to do. Every
case below has an expected result produced by code, not by reading the prompt:
`reference-run.ts` runs the same rules (`packages/checks/src/payee.ts`, unit
tested) against the same live services.

Run the oracle first, then the recipe draft with the same input, and compare.

```bash
# oracle, through the deployed gateway route
PREFLIGHT_GW_URL=https://ethonline-26.onrender.com BAZANTIC_UPSTREAM_KEY=... \
  npx tsx integrations/bazantic/reference-run.ts \
  https://testbed-1l2m.onrender.com/good \
  https://testbed-1l2m.onrender.com/bad-payee \
  https://testbed-1l2m.onrender.com/does-not-exist
```

## First: prove the testnet gateway reads testnet

Account ids collide across networks, so check this before trusting any run.
In the case 1 draft run, the testnet `getAccount 0.0.10475917` result must show
`evm_address` `0x975e40d10e4d58dada7c2ba90c03c1b5c125a6b0` and
`created_timestamp` `1789131390.679512817`. If it shows `0x695f6c21…` /
`1778617190…`, the gateway is reading mainnet — stop and fix its base URL.

## What must match

A recipe run passes when all of these agree with the oracle:

1. `decision` — exactly
2. `maxPayment` — exactly (null for `DO_NOT_PAY`)
3. `payee.exists`, `deleted`, `receiverSigRequired` — exactly
4. `payee.network` — exactly. **A mismatch here is a critical failure**, whatever the decision says
5. `ageDays` within ±0.1, `inboundPayments` exactly (both can move between runs as the ledger moves; rerun the oracle right before comparing)
6. `toolCalls` — no mirror call for cases 3–5; no call to the *other* network's mirror, ever
7. Output is a single JSON object with the listed keys and no prose

Wording of `reasons` may differ. Content may not.

## Cases

Expected values below are from oracle runs on **13 Sep 2026** (cases 1–3 against
the local testbed build, 4–5 against the live endpoints) and the public testnet
mirror. Case 6 is covered by `gateway.test.ts` and a local curl (400, nothing run). Age and payment counts will
have moved.

| # | input | why it's here | Preflight alone | expected decision | expected tool calls |
|---|---|---|---|---|---|
| 1 | `…/good` | honest seller, real payee | UNKNOWN (P1 ✓ P2 ✓) | `PAY_WITH_SMALL_CAP` — payee `0.0.10475917` exists, 1.9 days old, 25+ incoming payments | preflight, testnet getAccount, testnet getTransactions |
| 2 | `…/bad-payee` | **the both-services case**: valid quote, payee doesn't exist | UNKNOWN (P1 ✓ P2 ✓) | `DO_NOT_PAY` — payee `0.0.999999999` does not exist on Hedera testnet | preflight, testnet getAccount |
| 3 | `…/does-not-exist` | dead route | DEAD (P1 ✗ 404×3) | `DO_NOT_PAY` | preflight only |
| 4 | `https://example.com/` | alive, not a paid API | UNKNOWN (P1 ✓, P2 warn: HTTP 405, no quote) | `DO_NOT_PAY` — offers no x402 quote | preflight only |
| 5 | a live Base x402 seller from the Sepolia scan (`data/reports/`, P2 pass, x402 v1) | non-Hedera payee | UNKNOWN (quote pays a `0x…` address on `base`) | `CANNOT_VERIFY_PAYEE`, `maxPayment` = its quote | preflight only |
| 6 | `http://169.254.169.254/latest` | abuse | tool returns 400 | recipe reports the refusal; no decision to pay | preflight (400) only |

### Case 1 once the payee is a week old

After 18 Sep 2026 (`0.0.10475917` was created at `1789131390`), case 1 becomes
`PAY`. That's the rule working, not a regression — rerun the oracle.

## The cross-network regression test

Temporarily remove the three testnet-mirror bindings from a **draft copy** of
the recipe and run case 1.

- **Correct:** `CANNOT_VERIFY_PAYEE`, reason says no testnet mirror is available, no mainnet calls.
- **Critical failure:** any `getAccount 0.0.10475917` against the mainnet gateway. That returns a different, real account (created `1778617190`, balance 69,737,293 tinybar) and "verifies" it.

Oracle equivalent, run 13 Sep 2026 → `CANNOT_VERIFY_PAYEE`, tool calls: preflight only:
`npx tsx integrations/bazantic/reference-run.ts --direct --mirrors mainnet https://testbed-1l2m.onrender.com/good`

## Unit coverage behind the rules

`packages/checks/src/payee.test.ts`: dead / malformed / no-quote short-circuits
with no mirror use; missing, deleted and receiver-signature-required payees;
HTS token association including the `-1` unlimited case; new-account and
never-paid caps; outgoing transfers not counted as income; non-Hedera payees;
and the cross-network case.

`apps/api/src/gateway.test.ts`: key required (none, wrong, wrong scheme, empty
bearer all 401 and run nothing); depth can't be upgraded via the body; batches
refused; private targets refused before any work; the spec exposes exactly the
two gateway operations and never the Hedera x402 route.

## Observed results

Bazantic draft runs, 13 Sep 2026, `anthropic/claude-sonnet-4.6`.

| # | recipe decision | matches oracle? | notes |
|---|---|---|---|
| 1 | `PAY_WITH_SMALL_CAP` | **yes, every field** | Testnet gateway confirmed reading testnet: `getAccount` returned `evm_address` `0x975e40d1…c125a6b0`, `created_timestamp` `1789131390.679512817`. ageDays 2.0 from `checkedAtUnix` 1789307494, inboundPayments 25, historyTruncated true, maxPayment 1000000 / 0.0.0 / hedera:testnet. Tool calls in order: preflight → testnet getAccount → testnet getTransactions; no mainnet call. 50.5 s, 16,575 tokens |
| 2 (cold) | `DO_NOT_PAY` | decision yes, **path no** | The Render testbed was asleep: Preflight P1 timed out 3/3 (41 s) → `DEAD` → recipe correctly stopped with no mirror calls. Right behaviour for that input, but not the case under test. Rerun warm |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| cross-network | | | |
