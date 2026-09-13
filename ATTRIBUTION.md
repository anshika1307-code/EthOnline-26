# Attribution

What's new work built during ETHOnline 2026, and what's reused. ETHGlobal
asks submissions to draw this line clearly.

**Track: Start Fresh.** Every project-specific line in this repo was
written during the event, first commit `e9af1c3` on 10 Sep 2026, after the
hackathon opened on 4 Sep. Nothing pre-event was imported.

## New, written during the event

| Path | What it is |
|---|---|
| `packages/registry/src/fetch-agents.ts` | The ERC-8004 registry scanner |
| `packages/checks/src/checks/p1-liveness.ts` | Liveness check |
| `packages/checks/src/checks/p2-quote.ts` | Quote validity + price match |
| `packages/checks/src/checks/p4-delivery.ts` | Delivery check, pays, then verifies |
| `packages/checks/src/checks/a1-replay.ts` | Replay check (own test services only) |
| `packages/checks/src/checks/p5-concentration.ts` | Discovery concentration |
| `packages/checks/src/guard.ts` | The ethics boundary, enforced in code |
| `packages/checks/src/report.ts`, `types.ts` | Verdict logic and report format |
| `packages/checks/src/**/*.test.ts` | 46 unit tests |
| `testbed/src/server.ts` | Three test endpoints (good / bad-replay / bad-delivery) |
| `apps/api/src/server.ts` | Preflight sold per call, on Hedera |
| `src/app/page.tsx`, `src/lib/data.ts` | Dashboard |
| `data/**` | Every scan, check round, report, and test run, the evidence trail |
| All `.md` docs | Briefs, methodology, ethics, and this file |

## Reused, open-source dependencies

Listed for transparency, and permitted by the rules.

| Dependency | Use | Licence |
|---|---|---|
| `create-next-app` scaffold | Starting point for the dashboard | MIT |
| `next`, `react`, `react-dom` | Dashboard | MIT |
| `tailwindcss` | Styling | MIT |
| `viem` | Reading Ethereum/Hedera over JSON-RPC | MIT |
| `@x402/core`, `@x402/hedera`, `@x402/express`, `@x402/fetch` | The x402 payment protocol, client and server | Apache-2.0 |
| `@hiero-ledger/sdk` (via `@x402/hedera`) | Hedera SDK primitives, imported only through the re-export | Apache-2.0 |
| `express` | Test services and API | MIT |
| `tsx`, `typescript`, `dotenv` | Tooling | MIT / BSD-2 |

Used but not vendored into this repo: the ERC-8004 registry contract
(`0x8004A818BFB912233c491871b3d84c89A494BD9e`), Hashio's public JSON-RPC,
Hedera's mirror node, and the Blocky402 testnet facilitator.

## Not ours, and not claimed

- **The attack taxonomy** comes from the papers in [`PRIOR_ART.md`](./PRIOR_ART.md),
  we implemented published attacks; we didn't discover them.
- **The registry contract** is the canonical deployment by the ERC-8004
  team, we only read it.
- **The agents we scanned** belong to other people. They're anonymized in
  anything we publish.

## Contributed back upstream

One pull request opened against
[`hedera-dev/hedera-harness`](https://github.com/hedera-dev/hedera-harness)
during the event, fixing a payment-protocol header documented incorrectly
in `docs/prds/x402-metered-api.md`. Patch and write-up in
[`data/harness-pr/`](./data/harness-pr/); the friction that led to it is
logged in [`HEDERA_FEEDBACK.md`](./HEDERA_FEEDBACK.md).

## AI

See [`AI_USAGE.md`](./AI_USAGE.md), this project leaned heavily on Claude
Code, and that file says plainly what it wrote, what was mine, and the
mistakes a review caught before they shipped.
