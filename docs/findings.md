# The ERC-8004 agent registry is registration-heavy and operationally near-empty

**An open dataset and method · Preflight · 12 September 2026**

We scanned **every agent** in the ERC-8004 identity registry on Ethereum
Sepolia(all 10,249 of them) and did the thing no existing tool does:
**actually contacted the endpoints they declare.**

Of those 10,249 registered agents, **37 have an endpoint that answers**, and
**5 can actually be paid.**

Prior work measured *declaration*. This measures *behavior*.

---

## 1. The headline

| Stage | Agents | Share |
|---|---|---|
| Registered on-chain | 10,249 | 100% |
| Lists a working web address | 85 | 0.83% |
| Endpoint actually answers | 37 | 0.36% |
| Offers a valid payment quote | 5 | 0.05% |

Every number here can be regenerated from raw files in this repo:

```bash
node scripts/verify-claims.mjs
```

**This corroborates existing research.** A prior study
([arXiv:2606.12128](https://arxiv.org/abs/2606.12128)) found 67 of the
first 10,000 agents (0.67%) exposing a service record. Our figure, 0.83%
across the *full* registry, is an independent replication using a
different counting method, landing in the same place. Their conclusion,
"registration-heavy but operationally shallow", holds, and the rows below
quantify exactly how shallow.

---

## 2. Three findings

### 2.1 The five payable agents don't even speak the same protocol

All five are genuinely alive and return a well-formed payment quote, none
is broken. But they split across two incompatible protocol versions:

| Agents | Version | Chain | Asset |
|---|---|---|---|
| 6382, 6425, 6498 | v1 | Base mainnet | USDC |
| 6553 | v1 | Base Sepolia | USDC |
| 10123 | v2 | Hedera testnet | HBAR |

The two versions don't understand each other's requests: v1 puts the price
in the response body, v2 puts it in a header; the field names differ; even
the payment header itself has a different name. **A buyer built for v2
literally cannot pay four of the five payable agents in the registry, and
gets no useful error telling it why.** We hit this from both sides
ourselves: our own test endpoint silently stopped demonstrating a security
flaw it was built to demonstrate (which became an
[upstream fix](../data/harness-pr/) to Hedera's tooling), and our own
checker briefly and wrongly called all four v1 agents "broken." Full story
in [`METHODOLOGY.md`](../METHODOLOGY.md).

### 2.2 One wallet owns 58% of the entire registry

| | Agents | Share |
|---|---|---|
| Top single owner | 5,846 | **58.3%** |
| Top 10 owners | 7,065 | **70.5%** |
| Distinct owners | 1,489 | n/a |

Verified with direct on-chain ownership calls, not inferred. Prior research
found the top 10 wallets held 51.4% of the first 10,000 agents; at full
scale we find 70.5%, with one address holding the outright majority. This
isn't 10,249 independent participants.

### 2.3 Discovery is *not* concentrated, which contradicts earlier findings, and we're saying so

Among the 149 real endpoints we found, there are 44 distinct domains, with
the top domain at just **11.4%**. Earlier research on the broader x402
endpoint population found the top domain at **77.5%**.

Different dataset, genuinely different answer. This registry's shortlist
isn't dominated by one host the way the wider x402 population is. We're
reporting this because a result that fails to confirm someone else's
finding is still a result worth publishing, not quietly dropping.

---

## 3. What the other 10,164 agents look like

| Category | Agents | Meaning |
|---|---|---|
| Registered, offers nothing | 7,707 | Info resolved fine, it just lists no services |
| Couldn't be read | 1,541 | Mostly IPFS gateways refusing automated traffic |
| Placeholder / test domain | 407 | Points at something like `example.com` |
| Never published anything | 374 | Registered, nothing filled in |
| Has entries, none callable | 135 | e.g. only an email or name listed |
| Has a real, working endpoint | 85 | n/a |

**Three quarters of the registry is an agent that registered and then said,
in effect, "I offer nothing."**

### Of the 1,541 we couldn't read

- **795** were actually attempted and failed against every gateway we tried
- **746** were never attempted, we'd already given up on IPFS for that run
  after too many consecutive failures, to avoid spending hours retrying a
  format that clearly wasn't answering

Neither group should be read as "1,541 broken agents", they're two
different kinds of "we don't know," and the raw data distinguishes them.

---

## 4. How fast the working ones are

Of the 149 declared endpoints: **67 responded**, 7 intermittently, 75 never
did. The ones that *did* respond were fast, a median of **99ms**. The
ecosystem's problem here isn't speed. It's that almost nothing answers at
all.

---

## 5. The method, briefly

Full detail: [`METHODOLOGY.md`](../METHODOLOGY.md). In short: we enumerate
agent IDs sequentially (the registry has no total-count function),
resolve metadata across three different storage formats, filter down to
"real, callable, reachable" endpoints only (the loose definition would have
given 184 agents instead of 85, 43 of those extra were pointing at
`localhost`), and measure liveness with retries, correct timeout handling,
and version-aware payment validation.

### Bugs we found in our own measurement, and are listing anyway

Five measurement bugs surfaced while building this. **Four made the
ecosystem look worse than reality**, and one would have published a false
claim about real third parties:

1. Measuring our own timeout instead of real response time (10 seconds →
   really 99ms)
2. Only trying `GET`, which hid every POST-only endpoint
3. Treating "payment required" as "dead," hiding every payable agent
4. A version-blind checker calling four correctly-working agents "broken",
   caught before publishing by a live re-check
5. Counting homepage links and `localhost` as real endpoints, inflating the
   count 2×

We caught every one of these because two of our own checks contradicted
each other, a valid payment quote from an endpoint we'd just called dead
isn't a state the world can actually be in. A measurement write-up without
an errors section isn't being honest about measurement, so here it is.

---

## 6. Ethics

Third-party endpoints got **passive checks only**, one request, identified
by name, stopping on any refusal signal, never a real payment attempt. The
aggressive checks (replay, idempotency) ran **only against endpoints we
built and owned ourselves**, enforced in code rather than left to
discipline.

Third parties are **anonymized** everywhere we publish. Where individual
agent IDs appear above, it's to report a public, technical, on-chain fact,
a protocol version, an ownership count, never a judgment about anyone's
intent. Most of what we found looks like tests, demos, and hackathon
artifacts, which is a perfectly reasonable thing for a young registry to be
full of. Full boundary: [`ETHICS.md`](../ETHICS.md).

---

## 7. The dataset

| Path | Contents |
|---|---|
| `data/scan-runs/sepolia-*.json` | Full registry scans |
| `data/liveness-runs/sepolia-p1-*.json` | Every liveness round, per-probe |
| `data/reports/sepolia-reports-*.json` | Rendered reports and verdicts |
| `data/testbed-runs/*.txt` | Runs against our own test services |
| `scripts/verify-claims.mjs` | Re-derives every headline number above |

Timestamped and append-only, nothing here is asserted without a file
behind it.

### Reproducing it

```bash
npm install
cp .env.local.example .env.local     # set RPC_URL for Sepolia
npm run fetch-agents                 # ~6 min for the full registry
cd packages/checks && npm run p1 && npm run report
node ../../scripts/verify-claims.mjs
```

---

## 8. Limitations

- **One chain, one moment.** Sepolia only, scanned 12 Sep 2026, agents may
  have come up or gone down since.
- **1,541 agents (15%) unread**, mostly IPFS refusals, if those skew
  toward working agents, our numbers are conservative.
- **Price matching never ran.** The registry standard has no price field
  to compare against, and we deliberately don't guess one from free text.
- **No third-party endpoint can score `SAFE`**, because that requires a
  real completed payment, which we only ever make against our own test
  services.
- **Endpoint classification is a judgment call**, documented, and the raw
  data is kept so anyone can recount under a different rule.

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
