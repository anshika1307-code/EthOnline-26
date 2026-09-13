# Preflight — Implementation & Testing Plan

Companion to `ROADMAP.md` (when) and `rules.md` (constraints). This is **how**.
Derived from `preflight-brief-v3.md` §3, §5, §9, §15.

---

## 1. Target structure

v3 §15 defines the layout. Compressed for 2 days — build only what a block
needs, but put it in the right place so the tree matches the brief.

```
/
├── ETHICS.md                    # v3 §4 verbatim          ← Block 0
├── METHODOLOGY.md               # exists; extend per check
├── PRIOR_ART.md / ATTRIBUTION.md / AI_USAGE.md            ← Block 3
├── docs/
│   ├── architecture.md
│   └── findings.md              # the published result
├── apps/
│   ├── web/                     # dashboard (the existing Next.js app)
│   └── mcp/                     # MCP server + x402 gate
├── packages/
│   ├── registry/                # EXISTS — reader + metadata resolver
│   ├── checks/                  # P1–P5, A1–A4. Pure. Unit-tested.
│   └── report/                  # verdict + evidence rendering
├── testbed/
│   ├── good/ bad-replay/ bad-delivery/
└── data/
    ├── scan-runs/               # exists
    └── liveness-runs/
```

**Note:** the Next.js app currently sits at the repo root (`src/app`), not
`apps/web`. Moving it costs ~20 min and churns the diff. **Decision: leave it
at root**, note the deviation in `docs/architecture.md`. Structure is not a
qualification requirement; commit history and working code are.

## 2. Core types (build these first — everything depends on them)

`packages/checks/src/types.ts`

```ts
export type CheckId = 'P1'|'P2'|'P3'|'P4'|'P5'|'A1'|'A2'|'A3'|'A4';
export type Outcome = 'pass' | 'fail' | 'warn' | 'skipped';

export type CheckResult = {
  id: CheckId;
  outcome: Outcome;
  /** One plain-English line for the report. Facts, never accusations. */
  summary: string;
  /** Raw observation kept for replay: status codes, bodies, timings, tx hashes. */
  evidence: Record<string, unknown>;
  observedAt: string;   // ISO
  skippedReason?: string;
};

export type Verdict = 'SAFE'|'CAUTION'|'UNSAFE'|'DEAD'|'UNKNOWN';

export type PreflightReport = {
  target: { endpoint?: string; agentId?: string; chain: string };
  verdict: Verdict;
  checks: CheckResult[];
  /** True only for our own testbed hosts. Gates Group A. */
  activeChecksRun: boolean;
  generatedAt: string;
};
```

**Verdict derivation** (deterministic, documented in `METHODOLOGY.md`):

| Condition | Verdict |
|---|---|
| P1 failed every round | `DEAD` |
| P4 failed (paid, nothing delivered) or any A-check failed | `UNSAFE` |
| P2 or P3 failed | `CAUTION` |
| All run checks passed | `SAFE` |
| Too few checks ran to judge | `UNKNOWN` |

No score. No weights. A judge reads the table and recomputes by hand.

## 3. The ethics gate — implement before any active check

`packages/checks/src/guard.ts`

```ts
/** Hosts we deployed ourselves. Group A may run ONLY against these. */
const OWN_TESTBED_HOSTS = new Set([ /* filled from testbed deploy URLs */ ]);

export function assertOwnTestbed(url: string, checkId: CheckId): void {
  const host = new URL(url).hostname.toLowerCase();
  if (!OWN_TESTBED_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run active check ${checkId} against ${host}: not our testbed. ` +
      `Active checks against third parties are unauthorised testing (see ETHICS.md).`
    );
  }
}
```

Every A-check calls this **first line, no exceptions**. `rules.md` §2 rule 2
requires this enforced in code, not prose.

Also set the User-Agent globally (rule 3):
`Preflight/0.1 (+https://github.com/<user>/<repo>) ERC-8004 endpoint checker`

## 4. Check-by-check implementation

### P1 — Liveness
Input: declared `http(s)` endpoints from `packages/registry`.
`GET` (or `HEAD` fallback), 3 rounds spread across the event, timeout ~10s.
Record status, final URL after redirects, median latency of 3 attempts, TLS
validity. Output `data/liveness-runs/<chain>-<ts>.json`.
Pass = responded in ≥1 round. `DEAD` = 0/3.

> Reuse the throttle/retry machinery already in `fetch-agents.ts` — it solved
> rate-limit and timeout handling once already.

### P2 — Quote validity
Unauthenticated request → expect **HTTP 402**. Parse the payment
requirements per the x402 spec. Pass = 402 with parseable, complete
requirements. Fail = no 402, or malformed/missing fields. Keep the raw body.

### P3 — Price consistency
Compare the price quoted in P2's 402 against the price advertised in the
agent's ERC-8004 registration metadata. Fail on mismatch; record both numbers
and the ratio. If metadata advertises no price → `skipped`, not `fail`.

### P4 — Delivery ⭐ (the emotional core — v3 §11.2)
x402 **client**. One ordinary legitimate payment, then verify the resource
actually returns.
- Pass: paid → HTTP 2xx → non-empty, content-type-appropriate body
- **Fail: paid → error or empty** ← the headline failure mode from both papers
- Record: tx hash, amount, HTTP status, response excerpt, elapsed time
- **Hard spend cap** in config. Never loop. One payment per endpoint per round.
- Order of testing: our `good` → our `bad-delivery` → only then third parties

### P5 — Discovery concentration
Already computed in `research.md` (top-10 owners = 71.4% at n=500). Port to
`packages/checks`: group declared endpoints by registrable domain, report top-N
share. Paper 1's comparator: 77.5% single top domain. `warn` above a documented
threshold. Anonymise domains in output (`rules.md` §2 rule 7).

### A1 — Replay window · testbed only
`assertOwnTestbed()` → submit the same payment proof twice → fail if the
service delivers twice. Catches free shopping.

### A2 — Idempotency · testbed only
Duplicate callback/retry for one payment → fail if service released twice.

### A3 — Settlement timing · testbed only
Detect work starting on mempool sighting rather than finality.

### A4 — Allowance scope · testbed only
Inspect approval/session-key scope; flag unlimited or long-lived grants.

> A2–A4 are explicitly **"nice, not required"** (v3 §10 day 3.5). First cut line.

## 5. The testbed (v3 §5 — build in Block 0/1)

Three small Express services, x402-gated via `@x402/hedera` + Blocky402.

| Service | Behaviour | Scanner must say |
|---|---|---|
| `good` | Verifies proof, checks nonce, settles, delivers | **SAFE** |
| `bad-replay` | Accepts the same payment proof repeatedly | **UNSAFE** (A1) |
| `bad-delivery` | Takes payment, returns 500 | **UNSAFE** (P4) |

These are the demo. They are deterministic, authorised, and legible in 40
seconds on camera. Deploy anywhere cheap; register their hosts in
`OWN_TESTBED_HOSTS`.

## 6. Front doors

**Dashboard** (`src/app`) — headline number top, reports below, one scan form.
Reads JSON from `data/`; no database (v3 §9 allows Postgres/SQLite — on a
2-day clock, files are faster and are already the evidence trail).

**MCP server** (`apps/mcp`) — `preflight_check(endpoint_or_agent_id)` and
`ecosystem_stats()`. Official MCP TypeScript SDK — **verify the current package
and server API before installing**.

**x402 gate** — in front of the MCP/API, on Hedera, via Blocky402. This is
simultaneously v3 front door #3, Hedera track 11's qualification, and the
service Bazantic's gateway wraps. One piece of work, three prize obligations.

---

# 7. Testing plan

Time is short, so testing is **targeted at what would silently produce a wrong
public number** — not uniform coverage.

## 7.1 Unit tests — `packages/checks` (highest value)

These are pure functions over recorded fixtures. Fast, no network.

| Target | Cases |
|---|---|
| **Verdict derivation** | Each row of the §2 table; precedence (P4 fail + P2 fail → UNSAFE not CAUTION); all-skipped → UNKNOWN |
| **`assertOwnTestbed`** | Testbed host passes; third-party host **throws**; subdomain not silently allowed; malformed URL throws. **Non-negotiable — this is the safety rail** |
| **P2 quote parsing** | Well-formed 402; missing fields; non-402; HTML error page; empty body |
| **P3 price compare** | Match; 4× mismatch; no advertised price → `skipped`; unit/decimal mismatch |
| **P5 concentration** | Known distribution → known top-N share; single-domain → 100%; empty input |
| **Report renderer** | Evidence lines render; skipped checks show the reason; no accusatory language in templates |

Fixtures come from **real recorded responses** already in `data/scan-runs/`,
not invented ones.

## 7.2 Integration tests — against our own testbed only

The testbed *is* the integration test rig, which is why it earns its build cost:

| Test | Expected |
|---|---|
| Full scan of `good` | `SAFE`, P1–P4 pass, A1 pass |
| Full scan of `bad-delivery` | `UNSAFE`, **P4 fail** with tx hash + 500 recorded |
| Full scan of `bad-replay` | `UNSAFE`, **A1 fail** (delivered twice on one proof) |
| A-check against a third-party host | **Throws**, scan continues, report marks `skipped` |

Run this suite before recording the video. It is both the correctness check and
the demo script.

## 7.3 Payment-path testing (highest risk area)

- Test `good` and `bad-delivery` **before** pointing P4 at any third party
- Assert the **spend cap** rejects an over-limit payment
- Assert one payment per endpoint per round — no retry loop can double-spend
- Record every tx hash; reconcile against HashScan after the run
- Failure mode to explicitly test: **payment succeeds, delivery fails** — the
  client must not crash, must record, and must mark `UNSAFE`

## 7.4 Data-integrity checks (protects the headline number)

Before any number goes in the README, site, or video:

1. Re-derive it from the raw JSON with a separate one-off script — if the two
   disagree, the number is wrong
2. State sample size and scan timestamp next to every statistic
3. Confirm the denominator: only *confirmed* reads count, per
   `METHODOLOGY.md`'s existing category rules. Do not let
   `unknown-gateway-failed` or `junk-placeholder` inflate the finding
4. Spot-check 3 agents by hand against the block explorer

## 7.5 Pre-submission smoke test

- [ ] `npm run scan && npm run check-liveness` from a clean clone reproduces
      the published numbers
- [ ] Dashboard loads in a clean browser (no cache) and on mobile
- [ ] MCP tool callable from a real client; returns a report
- [ ] x402 gate returns a valid 402, and a real payment unlocks the response
- [ ] Every link in the README resolves
- [ ] Repo clone → README steps → working locally, by the README alone

## 7.6 What we deliberately do NOT test

Say so in the README; it shows judgement rather than gaps:
- Group A behaviour of third-party endpoints (unauthorised — `ETHICS.md`)
- Endpoints behind auth we were not given
- Whether a delivered resource is *correct*, only that it was delivered
- Mainnet payment paths (testnet only within the event)

---

## 8. Order of build — the dependency chain

```
types + guard  →  testbed(good)  →  x402 settle proof   [Block 0 gate]
       ↓
P1 liveness ──→ P4 delivery ──→ bad-delivery / bad-replay ──→ A1
       ↓              ↓
P2 quote ────→ P3 price
       ↓
P5 concentration → report renderer → dashboard
                          ↓
                    MCP + x402 gate → Bazantic gateway/recipe
                          ↓
                 (stretch) subgraph → The Graph slot
```

Nothing downstream of the Block 0 gate works until a payment settles on Hedera.
**That is the single most important thing to get done tonight.**
