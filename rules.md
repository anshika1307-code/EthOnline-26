# rules.md — constraints to hold to throughout development

**Read before planning, before committing, before cutting scope.**
These are qualification and safety requirements, not preferences. Breaking one
can disqualify the submission or do real harm, regardless of code quality.

Sources: `preflight-brief-v3.md` §4/§14/§15, the sponsor prize pages in this
repo, and ethglobal.com pages fetched 2026-09-11. **Re-check the live event
page before submitting** — sponsors edit prize pages mid-event.

---

## 1. Hard deadline

**Sunday 13 September 2026, 12:00 PM EDT = 21:30 IST Sunday.**

Sunday afternoon is submission and buffer, not build time.

## 2. The ethics boundary — the one that matters most

From `preflight-brief-v3.md` §4. This is a safety rule, not a scoring rule.

> **Group A (active) checks NEVER run against endpoints we do not own.**

Replay attempts, free-shopping attempts and gas-abuse probes against
third-party services are **unauthorised testing**. The papers did this under
responsible disclosure; that authorisation does not transfer to us.

| # | Rule |
|---|---|
| 1 | Live third-party endpoints: **Group P only**. Passive, one request per round, sensible timeouts |
| 2 | Group A runs **only** against our own deployed testbed |
| 3 | **Identify ourselves** — User-Agent naming the project, linking the repo |
| 4 | Respect rate limits and any refusal signal. If asked to stop, stop |
| 5 | Publish the methodology so results can be replayed and challenged |
| 6 | Report facts, not accusations. *"Returned 500 after payment on 2026-09-12"*, never *"this agent is a scam"* |
| 7 | **No naming and shaming.** Anonymise third parties in the demo and dataset |

**Enforce rule 2 in code, not just in prose** — Group A checks must refuse to
run against any host not on our own allowlist. A comment is not a safeguard.

Goes in `ETHICS.md` verbatim and in the README.

## 3. Disqualifying rules

| Rule | What it means here |
|---|---|
| **Start Fresh track**: all work begins after the hackathon started | First commit was Sep 10 — inside the window. Import no pre-event code |
| Public repo, open source | Must be pushed and public before submission |
| **Incremental commit history** | "Large single commits or missing history may be disqualified." Commit every 45–60 min, <~400 changed lines, real messages. **Never squash before submission — the messy history is the evidence** |
| Demo video **2–4 minutes** | Under 2 or over 4 is **rejected**. Hedera/Bazantic allow ≤5, so 2–4 satisfies everything |
| Video ≥720p, **own spoken voice** | No TTS, no AI voiceover, no music-over-text, no speeding up, not filmed on a phone |
| AI must **assist**, not create | Projects relying entirely on AI may lose partner-prize eligibility |
| **Include spec files and prompts in the repo** | We use a spec-driven workflow → `AI_USAGE.md` is required, not optional |
| Explain any part in a **3-minute Q&A** | If you cannot explain a file, you do not ship it |
| Separate new work from reused | `ATTRIBUTION.md` |

## 4. Prize slots — pick sponsors, not tracks

**Up to 3 partner prizes per submission.** A sponsor with multiple tracks uses
**one** slot and you can be eligible for all of their tracks through it.

**Winning principle (v3 §7):** give each sponsor **one artifact that exists
independently of the demo.** Partners judge asynchronously and verify an
artifact in 30 seconds without running your app.

| Slot | Sponsor | Tracks | $ reachable | Seats | Artifact |
|---|---|---|---|---|---|
| 1 | **Hedera** | AI & Agentic Payments ($6K, 3×$2K) · Improve the Harness ($2K, 2×$1K) | **$8,000** | 5 | Open PR on the Hedera Harness |
| 2 | **Bazantic** | Best Recipe ($1K) · Agentify a New API ($1K) | $2,000 | 6 | A published, reusable recipe |
| 3a | **The Graph** | Composable ($5K) · AI Tooling *From Scratch* ($5K) | $10,000 | 6 | One schema, one query, N chains |
| 3b | **Privy** | B2B Financial Product · Best Financial Flow ($2.5K each) | $5,000 | 2 | Governed org wallet + spend policy |

**Slot 3 is chosen at submission, not now.** Default Privy (~4h); upgrade to
The Graph only if Block 0 settled early and Saturday finished clean.

> **🛟 Hedera's Harness track is the insurance policy.** Highest
> win-probability-per-hour on the board: an **unmerged PR qualifies**, we are
> already logging friction, and contribution tracks attract far fewer
> submissions than build tracks. Do it in **Block 1**, not Sunday.
> Never manufacture friction to pad it.

### ⚠ Continuity-only tracks we CANNOT enter (we are Start Fresh)

- Bazantic **"Help an Agent Use Your Hackathon Project"** — this is the A/B
  recipe test named as slot 3 in `preflight-brief-v3.md` §7. **It is
  Continuity-only.** Use *Best Recipe that uses EthGlobal Sponsor APIs* or
  *Agentify a new API* instead.
- The Graph **"Best AI Tooling (Continuity)"** — take the **From Scratch** pool.
- Hedera **Continuity** ($1K).

### Hedera track 11 — qualification checklist
- [ ] Live x402-gated service on Hedera testnet/mainnet
- [ ] Settled through the **Blocky402** facilitator (https://blocky402.com/)
- [ ] A platform/agent completing **≥1 real paid request end-to-end**
- [ ] Public repo + README covering setup, architecture, **payment flow**
- [ ] Demo video ≤5 min showing the paid request executing
- Bonus we already have: **ERC-8004 on-chain agent identity** — claim it explicitly

### Hedera track 12 — qualification checklist
- [ ] Meaningful contribution to the Hedera Harness — **an open PR is enough,
      it need not be merged** — or a new harness inspired by it
- [ ] Repo/PR link + README explaining the problem solved and how to run it
- [ ] Demo video ≤5 min showing the improvement working

### The Graph — qualification gotchas
- [ ] **Live data from a Graph provider.** Mocked, local-only or static
      datasets **do not qualify**
- [ ] Track 1: must **compose 2+ products or build on a standardized schema**.
      Querying one subgraph with no composition **does not qualify**
- [ ] Track 2: The Graph must be **load-bearing**, and do real work with the
      data — not print a raw query result

### Privy (slot 3b) — qualification checklist
- [ ] Privy integrated as a **core** part, not cosmetic
- [ ] Track 1: a business/organization wallet + ≥1 functional B2B workflow
- [ ] Track 2: a complete functional financial flow using Privy wallet actions
- Our angle: Preflight's **own** P4 spending runs through a Privy org wallet
      with a spend policy ("never auto-approve a check above $X") — governed
      agent spending, which is a real story rather than a bolt-on

### Bazantic — qualification checklist
- [ ] Account on bazantic.com; **provide the username in the submission**
- [ ] An x402/MPP Gateway created in Bazantic for Preflight
- [ ] A recipe using our service **plus ≥1 other sponsor service**, where the
      result meaningfully depends on both
- [ ] Screen recording demonstrating the completed flow start to finish

## 5. Judging criteria

Technicality · Originality · Practicality · **Usability (UI/UX/DX)** · WOW Factor

Liveness+delivery = Originality/WOW. The measured finding = Practicality.
Don't let the dashboard slip so far that Usability scores zero.

## 6. Product rules from v3

- **No rival reputation score.** We report findings, not opinions (v3 §3, §8).
  Verdict bands only: SAFE / CAUTION / UNSAFE / DEAD / UNKNOWN
- **Evidence first.** Every verdict line cites what was observed
- **Never fabricate a number.** Every statistic on the site, in the README or
  the video must be reproducible from a file in `data/`. If a scan didn't run,
  say so. Overstating a small finding is worse than reporting it honestly
- **Negative results are still results** (v3 §12)
- **Out of scope, say so in the README:** Group A against third parties, a
  rival reputation score, on-chain writes beyond our own payments, our own
  general-purpose agent, v2's collusion graph, any token
- **One project name: Preflight.** Not KYA — Sumsub ships "Know Your Agent"
  already (v3 header). `package.json` currently says `KYA`; fix it

## 7. Engineering rules

- **Verify third-party APIs before coding against them.** `@x402/hedera`,
  Blocky402, MCP SDK, Bazantic, Graph CLI — read current READMEs. v3 §9:
  *"Do not trust package names from memory, including mine."*
- Branches: `feat/testbed`, `feat/passive-checks`, `feat/active-checks`,
  `feat/mcp-x402`, `feat/dashboard`. Merge via PR even solo — readable trail
- `main` always deployable
- Keep `packages/checks` pure and unit-tested
- Keep `METHODOLOGY.md` current — it is what makes the numbers defensible
- Log Hedera friction **live**, exact error text, time lost

## 8. Pre-submission checklist

- [ ] Repo public, pushed, incremental history intact, not squashed
- [ ] `ETHICS.md` present; Group A allowlist enforced in code
- [ ] README: problem + citations, prior art, headline finding, ethics
      boundary, architecture, how to run, sponsor tech + exact file paths,
      new vs reused, honest limitations
- [ ] `PRIOR_ART.md`, `ATTRIBUTION.md`, `AI_USAGE.md` (with prompts/specs)
- [ ] One consistent name (Preflight) in README, `package.json`, site, video
- [ ] Live x402-gated service on Hedera; ≥1 settled payment on HashScan
- [ ] Video: 2–4 min, ≥720p, own voice, two takes
- [ ] 3 prize applications written properly (~2h), each naming exact product,
      exact file path, artifact link, and real feedback
- [ ] Dataset published with methodology
- [ ] Live URL tested in a clean browser and on mobile
- [ ] **Submitted before 21:30 IST Sunday**
