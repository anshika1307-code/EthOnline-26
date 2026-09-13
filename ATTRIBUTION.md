# Attribution

What is new work built during ETHOnline 2026, and what is reused. ETHGlobal
asks submissions to distinguish the two clearly.

**Track: Start Fresh (Classic).** All project-specific code in this repo was
written during the event. First commit `e9af1c3` (`Initial commit from Create
Next App`), 10 Sep 2026 — after the hackathon opened on 4 Sep. No pre-event
project code, designs or assets were imported.

## New — written during the event

| Path | What it is |
|---|---|
| `packages/registry/src/fetch-agents.ts` | ERC-8004 registry scanner: enumeration, metadata resolution across three URI shapes, six-way categorisation, concurrency pool, IPFS gateway fallback + circuit breaker |
| `packages/checks/src/checks/p1-liveness.ts` | P1 liveness |
| `packages/checks/src/checks/p2-quote.ts` | P2 quote validity, P3 price consistency |
| `packages/checks/src/checks/p4-delivery.ts` | P4 delivery — pays, then verifies the resource arrives |
| `packages/checks/src/checks/a1-replay.ts` | A1 replay (own testbed only) |
| `packages/checks/src/checks/p5-concentration.ts` | P5 discovery concentration |
| `packages/checks/src/guard.ts` | The ethics boundary, enforced in code |
| `packages/checks/src/report.ts`, `types.ts` | Verdict derivation and the Preflight Report |
| `packages/checks/src/**/*.test.ts` | 46 unit tests |
| `testbed/src/server.ts` | Three x402-gated endpoints (good / bad-replay / bad-delivery) |
| `apps/api/src/server.ts` | Preflight sold per call, x402-gated on Hedera |
| `src/app/page.tsx`, `src/lib/data.ts` | Dashboard |
| `data/**` | Every scan, liveness round, report and testbed run — the evidence trail |
| All `.md` docs | Briefs, methodology, ethics, roadmap, friction log |

## Reused — open-source dependencies

Permitted by the rules, listed for transparency.

| Dependency | Use | Licence |
|---|---|---|
| `create-next-app` scaffold | Starting point for the web app | MIT |
| `next`, `react`, `react-dom` | Dashboard | MIT |
| `tailwindcss` | Styling | MIT |
| `viem` | Ethereum/Hedera JSON-RPC reads | MIT |
| `@x402/core`, `@x402/hedera`, `@x402/express`, `@x402/fetch` | x402 protocol, client and server | Apache-2.0 |
| `@hiero-ledger/sdk` (via `@x402/hedera`) | Hedera SDK primitives — imported through the re-export, never directly | Apache-2.0 |
| `express` | Testbed and API | MIT |
| `tsx`, `typescript`, `dotenv` | Tooling | MIT / BSD-2 |

Third-party infrastructure used but not vendored: the ERC-8004 IdentityRegistry
(`0x8004A818BFB912233c491871b3d84c89A494BD9e`), Hashio public JSON-RPC, the
Hedera mirror node, and the Blocky402 testnet facilitator.

## Not ours, and not claimed

- **The attack taxonomy** is from the papers in `PRIOR_ART.md`. We implemented
  published attacks; we did not discover them.
- **The ERC-8004 registry contract** is the canonical deployment by the
  ERC-8004 team. We only read it.
- **The agents we scanned** belong to other people. They are anonymised in
  published output.

## Upstream contribution

One PR opened against [`hedera-dev/hedera-harness`](https://github.com/hedera-dev/hedera-harness)
during the event, correcting the x402 v1/v2 payment header in
`docs/prds/x402-metered-api.md`. Patch and description in `data/harness-pr/`;
the friction that produced it is logged in `HEDERA_FEEDBACK.md`.

## AI

See `AI_USAGE.md`. This project was heavily AI-assisted with Claude Code, and
that file states plainly what the AI wrote, what was mine, and the six
substantive corrections review caught.
