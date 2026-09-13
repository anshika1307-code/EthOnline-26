# The ERC-8004 agent registry is registration-heavy and operationally near-empty

**An open dataset and methodology · Preflight · 12 September 2026**

We scanned **every agent** in the ERC-8004 Identity Registry on Ethereum
Sepolia — 10,249 of them — resolved their metadata, and then did the thing no
existing tool does: **contacted the endpoints they declare**.

Of 10,249 registered agents, **37 have an endpoint that answers** and **5 can
actually be paid**.

Prior work measured *declaration*. This measures *behaviour*.

---

## 1. Headline

| Stage | Agents | Share of registry |
|---|---|---|
| Registered on-chain | 10,249 | 100% |
| Declare an addressable service endpoint | 85 | 0.83% |
| Endpoint answers when contacted | 37 | 0.36% |
| Offers a valid x402 payment quote | 5 | 0.05% |

Every figure is reproducible from `data/` in this repo:

```bash
node scripts/verify-claims.mjs   # re-derives each number, exits non-zero on disagreement
```

### Corroborating the literature

Mafrur & Khusumanegara ([arXiv:2606.12128](https://arxiv.org/abs/2606.12128))
found 67 of the first 10,000 agents (0.67%) exposing a service record. Our
declaration figure of **0.83% at full-registry scale** is an independent
replication with a different counting rule, and lands in the same place. Their
verdict — *"registration-heavy but operationally shallow"* — holds, and the
behavioural rows below quantify how shallow.

---

## 2. Three findings

### 2.1 The payable agent economy is split across incompatible protocol versions

All five paywalled agents are alive and return a **well-formed** quote. None is
broken. But they do not speak the same protocol:

| Agents | x402 | Chain | Amount | Asset |
|---|---|---|---|---|
| 6382, 6425, 6498 | **v1** | Base mainnet | 10000 | USDC |
| 6553 | **v1** | Base Sepolia | 1000 | USDC |
| 10123 | **v2** | Hedera testnet | 100000 | HBAR (`0.0.0`) |

x402 v1 and v2 are not wire-compatible. v1 carries the quote in the response
body and names the amount `maxAmountRequired`; v2 carries it in a
`PAYMENT-REQUIRED` header and names it `amount`. v1 sends payment as
`X-PAYMENT`, v2 as `PAYMENT-SIGNATURE` — and a v2 resource server does not read
`X-PAYMENT` at all.

**A buyer implemented against v2 cannot pay four of the five payable agents in
the registry**, and gets no useful error: the quote looks malformed, or the
payment header is silently ignored.

We hit this from both sides. Our own deliberately-vulnerable test endpoint
silently stopped being vulnerable because it read the v1 header (this became an
upstream [PR to the Hedera Harness](../data/harness-pr/)); and our own quote
validator, being v2-only, briefly reported all four v1 agents as broken. Both
are documented in [`METHODOLOGY.md`](../METHODOLOGY.md).

### 2.2 One address owns 58% of the registry

| | Agents | Share |
|---|---|---|
| Top owner (`0x92AAe085…507522`) | 5,846 | **58.3%** |
| Top 10 owners | 7,065 | **70.5%** |
| Distinct owners | 1,489 | — |

*(10,025 of 10,249 agents returned an owner; the rest reverted.)*

Verified on-chain by direct `ownerOf()` calls, not inferred from the scan.

Paper 3 reported the top 10 wallets at 51.4% of the first 10,000 agents. At
full-registry scale we find **70.5%**, with a single address holding the
majority outright. Whatever the registry counts, it is not 10,249 independent
participants.

### 2.3 Discovery is *not* concentrated — contradicting the x402 literature

Among the 149 declared endpoints there are **44 distinct domains**, with the
top domain at **11.4%** and the top three at 31.5%.

Paper 1 ([arXiv:2605.11781](https://arxiv.org/abs/2605.11781)) measured 13,760
x402 endpoints across 420 domains and found the top domain at **77.5%**.

Different corpus, genuinely different answer. The ERC-8004 registry shortlist
is *not* dominated by one host the way the x402 endpoint population is. We
report this because a check that fails to confirm a prior is still a result.

---

## 3. What the other 10,164 agents look like

| Category | Agents | Meaning |
|---|---|---|
| `confirmed-empty` | 7,707 | Metadata resolved, `services: []` — registered and empty |
| `unknown-gateway-failed` | 1,541 | Metadata could not be read |
| `junk-placeholder` | 407 | `agentURI` on an RFC 2606 reserved domain |
| `no-uri` | 374 | Registered, nothing published |
| `confirmed-no-endpoint` | 135 | Has services, none addressable over HTTP |
| `confirmed-has-endpoint` | 85 | Declares something callable |

**75% of the registry is an agent that published metadata saying it offers
nothing.**

### `agentURI` schemes, all 10,249

| Scheme | Agents |
|---|---|
| `data:` | 7,488 |
| `https:` | 1,099 |
| `ipfs:` | 769 |
| *(empty)* | 374 |
| `http:` | 399 |
| `ipns:` | 15 |
| other / malformed | ~105 |

The tail is instructive: **26 agents put raw JSON in the URI field** (it begins
`{"type"`), 57 use a `chaoschain:` scheme, several use bare ENS names or raw
hex strings. None of these resolves under any standard URI handling.

### Why 1,541 could not be read

Public IPFS gateways refuse this traffic. Of the 1,541:

- **795 were attempted** and failed against every gateway in the chain
- **746 were never attempted** — a circuit breaker had already tripped after
  repeated total failures, and the scan recorded them with that reason

These are different epistemic states and are distinguished in the error text.
Neither should be read as "1,541 broken agents".

Independently confirmed that this is the gateways, not us: fetching a known
agent CID through a browser's IPFS service-worker gateway returns
`504` / `"No providers were found"` — a DHT-level answer. Content that no
longer has providers is, honestly, not a working endpoint.

---

## 4. Liveness detail

Of 149 declared endpoints, **67 responded**, 7 intermittently, 75 dead.

Responding endpoints are **fast**: median **99 ms**, p90 503 ms, max 872 ms.
The ecosystem's problem is not latency. It is absence.

| First status from a dead endpoint | Count |
|---|---|
| no response at all | 39 |
| 404 | 25 |
| 403 | 7 |
| 401 | 7 |
| 406 / 400 / 422 | 4 |

Two endpoints answered only to `POST` (65 answered `GET`).

---

## 5. Method, in brief

Full detail in [`METHODOLOGY.md`](../METHODOLOGY.md). Summary:

- **Enumeration.** The registry has no `totalSupply()`. Agent ids are minted
  sequentially, so we binary-search the highest minted id and probe
  `tokenURI(1..N)`.
- **Metadata.** Resolved across three URI shapes (`data:`, `ipfs://`,
  `https://`), with a fallback for agents that declare `;base64` but store raw
  JSON (86 of 87 sampled `data:` agents needed it).
- **"Addressable service endpoint"** excludes homepages, social and docs links,
  and hosts unreachable by construction (`localhost`, RFC 1918, RFC 2606). The
  loose definition would have given 184 agents instead of 85 — 43 endpoints
  point at `localhost`.
- **Liveness (P1).** Three probes, latency at response headers (not body —
  several endpoints are SSE streams that never close), `POST` retry on 404/405,
  and **HTTP 402 counts as alive** because for a paywalled resource that is the
  correct answer.
- **Quote validity (P2).** One unpaid request; validates against the field set
  for the protocol version the endpoint declares.
- **Concentration (P5).** Grouped by registrable domain; domains anonymised in
  output.

### Corrections we made, and why we are listing them

Five measurement bugs were found and fixed during this work. **Four of the five
made the ecosystem look worse than it is**, and one would have published a
false claim about identifiable third parties:

1. Latency measured our own timeout against SSE streams (10,004 ms → 99 ms)
2. `GET`-only probing hid every POST-only endpoint
3. `402` counted as dead, hiding every payable agent
4. A v2-only quote validator reported four correct v1 sellers as "missing
   `amount`" — a false accusation, caught by re-checking live before publishing
5. Counting homepages and `localhost` as service endpoints inflated the
   declaration figure 2.2×

Each was caught by **checks contradicting each other** — P2 reporting a valid
payment quote for an endpoint P1 had just called dead is not a state the world
can be in. We list them because a measurement paper without an error section is
not being honest about measurement.

---

## 6. Ethics

Third-party endpoints received **passive checks only**: one request per probe,
identified by a User-Agent naming the project, stopping on any refusal signal,
never attempting payment. Adversarial checks (replay, idempotency) ran **only
against endpoints we deployed ourselves**, enforced in code rather than by
convention.

Third parties are **anonymised** in published reports and in the dashboard.
Where individual agent ids appear above, it is to report a technical fact about
a public on-chain record — a protocol version or an ownership count — never a
judgement about intent. Nothing here says any operator did anything wrong. Most
of these agents look like tests, demos and hackathon artifacts, which is a
reasonable thing for a young registry to be full of.

Full boundary: [`ETHICS.md`](../ETHICS.md).

---

## 7. The dataset

| Path | Contents |
|---|---|
| `data/scan-runs/sepolia-*.json` | Full registry scans: per-agent id, owner, `agentURI`, resolved `services[]`, category, extracted endpoints |
| `data/liveness-runs/sepolia-p1-*.json` | P1 rounds: per-probe status, method, latency, redirects, content-type |
| `data/reports/sepolia-reports-*.json` | Rendered Preflight reports, verdicts, concentration stats |
| `data/testbed-runs/*.txt` | Testbed separation runs (our own endpoints) |
| `scripts/verify-claims.mjs` | Re-derives every headline number from the above |

Timestamped, append-only. Nothing in this document is asserted without a file
behind it.

### Reproducing

```bash
npm install
cp .env.local.example .env.local     # set RPC_URL for Sepolia
npm run fetch-agents                 # ~6 min for the full registry
cd packages/checks && npm run p1 && npm run report
node ../../scripts/verify-claims.mjs
```

---

## 8. Limitations

- **One chain.** Sepolia only. Multi-chain is parameterised but unscanned.
- **One point in time.** 12 Sep 2026. Agents may have come up or gone down.
- **1,541 agents unread** (15%) because of IPFS gateway refusal. If those skew
  systematically toward working agents, our figures are conservative.
- **P3 (price consistency) never ran.** ERC-8004 has no price field, so there
  is nothing on-chain to compare a quote against. We deliberately do not infer
  prices from free-text descriptions.
- **No third-party endpoint can be marked `SAFE`**, because that requires
  completing a real payment, which we only do against our own testbed. Verdicts
  for strangers top out at `CAUTION`.
- **Endpoint classification is a judgement call.** Ours is documented and the
  raw `services[]` is preserved, so anyone can recount under a different rule.

---

## 9. Citation

```
Preflight (2026). The ERC-8004 agent registry is registration-heavy and
operationally near-empty: a full-registry behavioural scan.
ETHOnline 2026. Dataset and methodology:
https://github.com/anshika1307-code/EthOnline-26
```

Scan: ERC-8004 IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e`,
Ethereum Sepolia, 2026-09-12T19:30:25Z.
