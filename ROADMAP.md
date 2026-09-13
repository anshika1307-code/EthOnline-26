# Preflight — 2-Day Roadmap (compressed from brief v3)

**Deadline: Sun 13 Sep 2026, 12:00 PM EDT = 21:30 IST Sunday.**
Written Fri 11 Sep evening. Available time ≈ 25 working hours.

Governing documents: `preflight-brief-v3.md` (the plan), `rules.md` (the
constraints). This file is the compression of v3's 4-day plan into the time
actually left. Where the two disagree, v3 defines *what*, this defines *when*.

---

## 1. What v3 says we are building, restated

**Not** "is this agent alive" (v2). **"Is it safe to pay this endpoint?"** (v3)

Output is a **Preflight Report** — plain English, evidence first, verdict bands
**SAFE / CAUTION / UNSAFE / DEAD / UNKNOWN**.

> **No rival reputation score.** v3 §3 and §8 are explicit: we report findings,
> not opinions. QuickNode already ships a reputation score. Do not build a
> 0–100 rating. *(An earlier draft of this roadmap proposed one — that was
> wrong and is struck.)*

### The check suite (v3 §3)

**Group P — passive, safe against any live third-party endpoint**

| ID | Check | Catches |
|---|---|---|
| P1 | Liveness | Declared but dead. 3 rounds → "dead 3/3", not "dead once" |
| P2 | Quote validity | Malformed/missing 402 payment quote |
| P3 | Price consistency | Quoted price ≠ advertised price |
| P4 | **Delivery** | Paid, got nothing. *The emotional core of the project* |
| P5 | Discovery concentration | One domain dominating the registry |

**Group A — active, OUR OWN TESTBED ONLY, never third parties**

| ID | Check | Catches |
|---|---|---|
| A1 | Replay window | Same proof accepted twice → free shopping |
| A2 | Idempotency | Retry releases service twice for one payment |
| A3 | Settlement timing | Work starts on mempool sighting, not finality |
| A4 | Allowance scope | Unlimited approvals / long-lived session keys |

### The ethics boundary — a hard rule, not a preference

v3 §4 says read it twice, so: **Group A never runs against anything we do not
own.** Passive-only against third parties, one request per round, identify
ourselves via User-Agent, respect refusal signals, report facts not
accusations, anonymise third parties in the demo. Goes into `ETHICS.md`
verbatim and into the README.

This is also a *scoring* asset — v3 §6 lists it as a differentiator, and
Usability/judgement is visible to judges cheaply.

---

## 2. Where we actually are (Fri evening)

**Done:** `packages/registry/src/fetch-agents.ts` reads the ERC-8004 registry
on Sepolia, resolves all three URI shapes, buckets agents into 6 categories,
verified against 500 real agents. `METHODOLOGY.md` makes it replayable.
P5 data already exists in `research.md` (top-10 owners = 71.4% at n=500).

**In v3 terms:** we have the registry reader (v1's contribution) and the raw
material for P5. **We have not built a single check.** P1 does not exist.

**Not started:** testbed, P1–P4, A1–A4, report renderer, dashboard, MCP,
x402 anywhere, subgraph, Hedera, all sponsor artifacts.

## 3. The 2-day trade (be honest about this)

v3's scope is a 4-day plan and it does not fit. In 25 hours, solo, the
realistic outcome is **two strong sponsor slots and one stretch**, not three
strong ones.

**You pick sponsors, not tracks** — one slot covers all of that sponsor's
tracks. And you only choose the three **at submission**, so the third slot does
not have to be decided now: build it, then pick whichever you got furthest with.

| Slot | Sponsor | Tracks in the slot | $ reachable | Winner seats | Cost | Call |
|---|---|---|---|---|---|---|
| 1 | **Hedera** | AI & Agentic Payments ($6K, 3×$2K) + Harness ($2K, 2×$1K) | **$8,000** | 5 | Core to v3 anyway | **LOCK** |
| 2 | **Bazantic** | Best Recipe ($1K) + Agentify a New API ($1K) | $2,000 | 6 | ~4h, one gateway serves both | **LOCK** |
| 3a | **The Graph** | Composable ($5K) + AI Tooling *From Scratch* ($5K) | $10,000 | 6 | ~1 day | **Stretch** — highest ceiling |
| 3b | **Privy** | B2B Financial Product + Best Financial Flow ($2.5K each) | $5,000 | 2 | ~4h | **Safe fallback** |

**Decide slot 3 at the start of Block 3, not during it.** Default to Privy;
upgrade to The Graph only if Hedera settled early and Saturday finished clean.

### Why Hedera is the best slot by a distance
Track 11 fit is near-perfect — it is literally v3 front door #3 — and
*"on-chain agent identity using ERC-8004"* is listed as **bonus credit**, which
we already have built. Three winner seats. Track 12 is the floor underneath it.

### The insurance policy — do this early
**Hedera track 12 is the single highest win-probability-per-hour item on the
board.** An **unmerged PR qualifies**, we are already logging friction, and
contribution tracks attract a fraction of the submissions that build tracks do
(v3 §7 spotted this). Cost: one real PR plus a ≤5 min clip, ~3h.

It has therefore been **moved out of Block 3 and into Block 1**. It is the
difference between "won something" and "won nothing" if the x402 path fights
us, and it must not be left until Sunday.

### Slot-3 detail
- **The Graph** — track 2's text explicitly names *"new or extended MCP
  servers... x402 payment tooling"*, which is what we are building anyway.
  **Catch:** The Graph must be load-bearing on **live** Studio data —
  mocked/local/static explicitly does not qualify — so registry reads must
  actually route through a deployed subgraph. Indexing wait is unpredictable.
- **Privy** — wrap Preflight's *own* P4 spending in a Privy org wallet with a
  policy ("never auto-approve a check above $X"). Cheap, and it strengthens the
  core story (our tool spends money to check things, governed) rather than
  bolting something on.

### Considered and rejected
| Sponsor | Why not |
|---|---|
| **ENS** ($4.5K, 4 seats — best odds structure) | ENSIP-25/26 are on-point for agent identity, but ENSv2 is beta-on-Sepolia. v3 rejected it on a 4-day clock; worse on 2. **Wildcard only** |
| **Ledger** ($3.5K) | *"x402-style patterns"* is named in their text, but requires learning the Ledger Agent Stack + Key Ring CLI under time pressure |
| **Arc/Circle** ($3.5K + $2.5K bonus) | Needs a USDC settlement path we do not otherwise need. ~1 day. Bolted on |
| **Chainlink** ($2K) | Best conceptual fit of all — Group A checks in a TEE so the methodology cannot be gamed — but 1.5–2 days |
| World · 1inch · Uniswap · Hedera ATS | No fit. Do not chase slots |

**Correction to v3 §7 slot 3:** the brief names Bazantic *track 7* (the A/B
recipe test). That track is **Continuity-only** and we are Start Fresh — we
cannot win it. Use instead:
- **Best Recipe that uses EthGlobal Sponsor APIs** ($1,000) — needs a Bazantic
  x402/MPP gateway for Preflight + ≥1 other sponsor service in one recipe
- **Agentify a new API** ($1,000) — needs a genuinely new API added to Bazantic

**Correction to v3 §7 slot 1:** The Graph already lists Agent0/ERC-8004
subgraphs, so "publish an ERC-8004 schema" is not the novel artifact the brief
assumed. Track 1 rewards *composition and standardisation* — the artifact must
be **one schema, one query, N chains**, and it must consume live data from
Subgraph Studio (mocked/local/static explicitly does not qualify).

---

# Block 0 — Friday evening (~4h) · the safety net

v3 §11: *"The testbed demo. It's the only part guaranteed to work on camera.
Build it early."* So it goes first, before anything prettier.

1. **Repo hygiene first (15 min).** Push public. Create `ETHICS.md` with v3 §4
   verbatim. Commit. This alone protects partner-prize eligibility (`rules.md`).
2. **Hedera testnet account + HBAR.** Do this before writing code — it blocks
   everything downstream. Log the first friction to `HEDERA_FEEDBACK.md` from
   minute one; delete the `[EXAMPLE]` entries.
3. **Testbed `good` endpoint.** One Express service, x402-gated, on Hedera via
   Blocky402. Package `@x402/hedera` — **read its README, don't assume the API**.
4. **Prove one real payment settles end-to-end.** Capture the HashScan tx link.

**Block 0 checkpoint:** a payment settled on Hedera testnet. If this has not
happened by end of Friday, *escalate* — it is the $6K qualification requirement
and every downstream sponsor artifact leans on it.

# Block 1 — Saturday morning (~5h) · checks that bite

1. **`bad-delivery` and `bad-replay` testbed endpoints** (v3 §5). Small
   variations on `good`.
2. **P1 liveness** over the existing n=500 scan results. Store timestamped, so
   later rounds give "dead 3/3".
3. **P4 delivery** as an x402 *client* — pay, then verify the resource actually
   came back. Test against our own `good` and `bad-delivery` first.
4. **A1 replay** against `bad-replay` only.
5. **Record a raw screen capture of the scanner separating the three.** v3 §10
   calls this the day-4 safety net; on a 2-day clock capture it Saturday.
6. **🛟 Hedera Harness PR — the insurance policy (~1h of this block).**
   Take the best entry from `HEDERA_FEEDBACK.md` and turn it into a real PR
   against `github.com/hedera-dev/hedera-harness`. **It does not need to be
   merged.** If nothing is PR-shaped yet, open an **issue with a clean
   reproduction** — v3 §12 notes that still counts and takes five minutes.
   Prefer the v3 §7 PR shapes: docs fix > better error message > small missing
   method. One fix per PR, linked back to the log entry.

**Block 1 checkpoint:** the scanner separates SAFE from UNSAFE on our own
testbed, on camera — **and a Hedera Harness PR or issue is open.** That is the
demo's spine in the can, plus one prize track already claimable even if
everything after this goes wrong.

# Block 2 — Saturday afternoon/evening (~7h) · the real scan + front doors

1. **P2 quote validity, P3 price consistency** — cheap once P4's client exists.
2. **P5 concentration** — mostly done; port the `research.md` analysis into
   `packages/checks` so it renders in a report.
3. **Report renderer** (`packages/report`): the v3 §3 block format, verdict
   bands, evidence lines. Pure and unit-tested.
4. **Passive scan round 1 against the live registry.** Group P only. This
   produces the headline number.
5. **MCP server** — `preflight_check(endpoint_or_agent_id)`, `ecosystem_stats`.
   x402 gate in front. Deployed on Hedera → this is v3 front door #3 and
   Hedera track 11's "platform that consumes the service."
6. **Bazantic slot** (~1h of the block): account, x402/MPP gateway over
   `preflight_check`, one recipe combining it with another sponsor API.

**Block 2 checkpoint:** headline number exists and is reproducible from
`data/scan-runs/`. If not, v3 §12 fallback applies — *scarcity is the finding.*

# Block 3 — Sunday morning (~6h) · dashboard, then freeze

1. **Dashboard** (`apps/web`): headline number on top, individual reports
   below, one endpoint scan form. Plain and fast beats half-finished.
2. **Passive scan round 3** so video numbers are fresh and P1 can say "3/3".
3. **Slot 3 decision — make it now, at the start of the block.**
   - Hedera settled early *and* Saturday finished clean → **The Graph**
     (subgraph on live Studio data). If it stalls past 2h, drop it and keep
     direct RPC reads (v3 §12 fallback).
   - Otherwise → **Privy** (~4h): Preflight's own P4 spending inside an org
     wallet with a spend policy.
   - Do not start both. Do not drift into this decision mid-block.
4. **Second Harness PR — only if a genuinely better friction entry emerged.**
   The first one is already open from Block 1. Do not manufacture friction to
   pad this (`rules.md`).
5. **Docs:** `README.md`, `PRIOR_ART.md`, `ATTRIBUTION.md`, `AI_USAGE.md`
   (include the spec files and prompts — `rules.md`), `docs/findings.md`.

# Block 4 — Sunday 15:00–21:30 IST · ship

**Features frozen. No new code.**

1. Record the demo video to v3 §13's beat sheet. **2–4 min, ≥720p, own voice,
   no TTS.** Two takes minimum.
2. Publish the scan dataset (v3 §7 bonus multiplier).
3. Write the three prize applications properly — **budget two hours, not ten
   minutes** (v3 §11.4). Use the v3 §16 template. For each: exact product,
   exact file path, the artifact link, and real feedback.
4. Test the live URL in a clean browser and on mobile.
5. Run `rules.md` §8 checklist.
6. **Submit by 21:30 IST.** Not 21:31.

---

## Cut lines — declare out loud, don't drift

| If behind at… | Cut |
|---|---|
| End of Block 0 | Nothing. Escalate instead — payment settling is non-negotiable |
| End of Block 1 | A2–A4 (v3 already calls them "nice, not required"). **Not** the Harness PR — it is ~1h and it is the insurance |
| Start of Block 3 | The Graph → fall back to Privy. If also behind → take the 2-slot outcome and stop |
| Block 3 midpoint | Dashboard detail views → single page, hero stat + table |
| Block 4 | Nothing. Video and submission text are not cuttable |

**Never cut:** the testbed demo, P4 delivery, the settled Hedera payment, the
Harness PR, the ethics boundary, or the video.

**Two slots delivered well beats three delivered badly.** Hedera alone reaches
$8,000 across 5 winner seats; that is the prize board's best square and it is
where the hours should go if anything has to give.

## Definition of done

1. Testbed separates good / bad-replay / bad-delivery on camera
2. One real x402 payment settled on Hedera, visible on HashScan
3. A headline number reproducible from files in `data/`
4. Preflight Report renders with verdict + evidence lines for a real endpoint
5. `ETHICS.md` present, boundary honoured in code (Group A gated to own hosts)
6. `HEDERA_FEEDBACK.md` real entries; ≥1 PR or issue opened
7. Video 2–4 min, own voice; three prize applications written properly
8. `rules.md` §8 fully ticked, submitted before 21:30 IST Sunday

## Risks (v3 §12, re-timed for 2 days)

| Risk | Trouble sign | Fallback |
|---|---|---|
| x402/Blocky402 fights back | Not settling by end of Block 0 | Escalate immediately. It gates the biggest prize; borrow hours from The Graph slot |
| Almost no live endpoints | <20 found | Widen chains. If still thin, **scarcity is the finding** — lead with it |
| Every endpoint dead | 100% failure | Valid result: "N claimed, 0 answered" |
| Subgraph deploy/indexing slow | Stuck >2h in Block 3 | Drop the slot, direct RPC reads, ship 2 slots well |
| IPFS unresolvable (~35%) | Known | Already bucketed as `unknown-gateway-failed`. Do not chase |
| Time runs out | Behind at Block 3 | Hedera + Bazantic delivered well beats three delivered badly |

**v3's own pattern holds: negative results are still results.** The odds of
having nothing to show are very low.
