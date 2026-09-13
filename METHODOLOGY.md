# Scan methodology

How `packages/registry/src/fetch-agents.ts` reads the ERC-8004 Identity
Registry and decides whether an agent has a working service endpoint. Written
so a scan run is replayable and its numbers are checkable, not just trusted.

## Registry

- Chain: Ethereum Sepolia (chainId `11155111`)
- Contract: `0x8004A818BFB912233c491871b3d84c89A494BD9e` (IdentityRegistry,
  ERC-1967 proxy) — CREATE2-deployed at the same address on every supported
  chain. Source: [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts)
  README, cross-checked with `eth_getCode` returning matching bytecode on
  Ethereum Sepolia, Base Sepolia, and Hedera Testnet.

## Enumeration

Agent IDs are minted sequentially from 1 (`register()` returns an
incrementing `agentId`). The registry has no `totalSupply()` or
`ERC721Enumerable` — the default `probe` mode works around that:

1. Binary-search the highest minted ID via `ownerOf(id)` (reverts once past
   the end) — this is the reported total agent count.
2. Read `tokenURI(id)` for `id = START_ID .. START_ID + MAX_AGENTS`, skipping
   any ID that reverts (a gap).

`ENUM_MODE=logs` is available as an alternative: read `Registered` events
over `[START_BLOCK, latest]` in chunks. Not used by default — at ~10,000
agents this would mean over a thousand `eth_getLogs` calls against a public
RPC, too slow for a first pass. Kept for bounded-window use (e.g. "what
registered in the last N blocks").

## Metadata resolution — three URI shapes

`tokenURI(id)` (aliased `agentURI` in the ERC-8004 spec) can point at
metadata three different ways, and the scan sample (agent IDs 1–200) uses all
three:

| Scheme | Example | Handling |
|---|---|---|
| `data:` | `data:application/json;base64,eyJ0...` | Decoded in-process, no network call |
| `ipfs://` | `ipfs://QmXFE7...` | Resolved via gateway, see below |
| `https://` | `https://agent.example/registration.json` | Fetched directly, `FETCH_TIMEOUT_MS` (default 10s) |

An empty `agentURI` (agent registered via bare `register()`, metadata not
yet published) is valid per spec and categorized `no-uri`, not a failure.

### `data:` URI quirk: mislabeled base64

Some registered agents declare `;base64` in the media type but the payload
after the comma is raw (non-base64) JSON — a bug in whatever tooling minted
them (a cluster of hackathon/demo agents share the exact same failure
signature). `decodeDataUri()` tries the declared encoding first, then falls
back to treating the payload as raw text. Without this fallback, 86 of 87
sampled `data:` agents failed to parse.

### `ipfs://` resolution: gateway fallback chain

Public IPFS gateways rate-limit and time out heavily under scan-volume
traffic (see the friction log below). `resolveMetadata()` tries gateways from
`IPFS_GATEWAYS` in order — default `ipfs.io → dweb.link → cloudflare-ipfs.com`
— falling through on timeout, non-2xx, or exhausted 429 retries:

- First gateway: `FETCH_TIMEOUT_MS` (10s)
- Each fallback gateway: `IPFS_RETRY_TIMEOUT_MS` (20s) — more patient, since a
  slow-but-alive gateway beats moving on too soon
- Within a gateway: up to 2 retries on HTTP 429 with exponential backoff
- All requests to IPFS gateways are throttled to one in flight per
  `IPFS_DELAY_MS` (300ms default)

A timeout on every gateway does **not** necessarily mean our tooling is
broken — some CIDs genuinely have no providers left on the public IPFS
network (garbage-collected, never persistently pinned). We verified this
independently: fetching a known agent CID through a real browser's IPFS
service-worker gateway returned `504 Gateway Timeout` / `"No providers were
found"` — a DHT-level answer, not a rate limit. An agent whose declared
`ipfs://` endpoint has no providers is, honestly, not a working endpoint —
that's a legitimate finding about the agent, not a scan failure, though we
still bucket it separately (see below) because we can't be certain it isn't
also a transient gateway issue on our end.

## Result categories

Each sampled agent lands in exactly one bucket:

| Category | Meaning |
|---|---|
| `confirmed-has-endpoint` | Metadata resolved; `services[]` contains ≥1 entry with an `http(s)` `endpoint` |
| `confirmed-empty` | Metadata resolved; `services` is empty or absent |
| `confirmed-no-endpoint` | Metadata resolved; `services[]` has entries but none are `http(s)` URLs (e.g. only an ENS name, DID, or email) |
| `no-uri` | `agentURI` was never set — nothing published yet, not a failure |
| `junk-placeholder` | `agentURI` is an `http(s)` URL on an RFC 2606 reserved domain (`example.com`/`.test`/`.example`/`.invalid`/etc.) — a test/placeholder registration, not a real broken agent |
| `unknown-gateway-failed` | Metadata fetch genuinely failed (timeout, non-2xx, parse error) on what looks like a real destination |

**Headline number** — "agents with no working service endpoint" — is
`confirmed-empty + confirmed-no-endpoint`, out of a denominator of
`confirmed-empty + confirmed-no-endpoint + confirmed-has-endpoint`
(i.e. only agents whose declared metadata we actually, successfully read).
`no-uri`, `junk-placeholder`, and `unknown-gateway-failed` are reported but
excluded from the headline rate — they're not confirmed claims about the
agent's declared endpoints, and lumping placeholder/unknown noise in would
inflate the "shell agent" count with something other than the phenomenon
being measured.

### Junk-placeholder heuristic

`isJunkPlaceholder()` checks the `agentURI`'s hostname against RFC 2606
reserved domains (`example.com`, `example.net`, `example.org`, `example.edu`,
`localhost`) and reserved TLDs (`.test`, `.example`, `.invalid`,
`.localhost`). Only applies to `http(s)://` URIs. This is a narrow,
documented heuristic, not a guess — RFC 2606 domains are guaranteed to never
resolve to a real service, so a 404 there is a deliberate placeholder, not
evidence of a broken agent.

## Extracting service endpoints

`extractServiceEndpointUrls()` reads the spec's `services[]` array and keeps
only entries whose `endpoint` field matches `^https?://` — this deliberately
excludes non-URL endpoint kinds the spec allows (ENS names, DIDs, email
addresses, raw `ipfs://` service pointers) since "payable service endpoint"
implies something reachable over HTTP.

## Verdict bands

| Condition | Verdict |
|---|---|
| P1 failed every round | `DEAD` |
| P4 failed (paid, nothing delivered) or any A-check failed | `UNSAFE` |
| P2 or P3 failed | `CAUTION` |
| Everything that ran passed **and P4 passed** | `SAFE` |
| Anything else, including "alive but never paid" | `UNKNOWN` |

No score, no weighting. A reader can recompute any verdict by hand from the
check lines.

**`SAFE` requires P4 to have actually run and passed.** The product question is
*"is it safe to pay this endpoint"*, so an endpoint that merely answers a `GET`
is alive, not proven safe to pay — that is `UNKNOWN`. An earlier version
returned `SAFE` when only P1 had run, which labelled four third-party agents
safe to pay without ever attempting a payment. That is the kind of overclaim
ETHICS.md §6 exists to prevent.

Consequence worth stating in the write-up: against third parties we run passive
checks only and do not spend money, so most third-party verdicts are `DEAD` or
`UNKNOWN`, never `SAFE`. `SAFE` is reachable on our own testbed, where paying is
authorised. That asymmetry is honest rather than unfortunate.

## P1 (liveness) — and why latency is measured at the headers

P1 does one `GET` per endpoint per round, three attempts, identifying itself by
User-Agent, and stops immediately on a 429/403 refusal signal.

**Latency is time-to-response-headers, not time-to-body.** Several real agent
endpoints in the registry are MCP-over-SSE (`content-type: text/event-stream`)
and never close the connection. Draining those bodies measures our own timeout,
not the endpoint's speed — the first version of this check reported a median of
`10004ms` for four endpoints, which was exactly our 10s abort, not their
performance. Measured at the headers, the same endpoints return in
**305–1214ms**.

Streamed bodies are cancelled rather than read, so we do not hold an open
stream on someone else's server.

A `pass` therefore means "answered with a 2xx in every attempt", and for SSE
endpoints the reported latency is explicitly labelled as time-to-headers.

## P2 (quote validity) and P3 (price consistency)

P2 makes one unauthenticated request and checks the answer is a usable x402
quote: HTTP 402, a decodable `PAYMENT-REQUIRED` header (or JSON body), a
non-empty `accepts[]`, and required fields `scheme`, `network`, `amount`,
`asset`, `payTo`, with `amount` an integer in atomic units.

The probe method is recorded alongside the result. A `400`/`405` from a
GET-only resource is not the same finding as a refusal to quote, and the
reader has to be able to tell them apart.

`warn` (not `fail`) when the endpoint simply isn't paywalled — that is a fact
about the endpoint, not a defect in it.

### P3 rarely runs, and that is the finding

P3 compares the quoted price against the price advertised in the agent's
ERC-8004 registration. **The registration schema has no price field** —
`services[]` entries are `{name, endpoint, version}` — so unless an agent adds
something non-standard, there is nothing to compare against. In our 500-agent
sample, no agent published a machine-readable price.

We deliberately do **not** parse a price out of the free-text `description`.
Guessing a number from prose and then publishing a "4x mismatch" against it
would be an unfounded accusation (ETHICS.md §6). Absent a structured price,
P3 reports `skipped` with that reason.

This is worth stating plainly in the write-up: **an agent cannot currently
advertise its price on-chain in a way a buyer's software can check.** Price
consistency is unverifiable by construction, not because agents are hiding
anything.

## P5 (discovery concentration)

P5 is a property of the shortlist, not of one endpoint. If most of the registry
resolves to one domain, "pick an agent from the registry" is really "use that
provider", and the payment flow inherits whatever that provider does. Paper 1
(arXiv:2605.11781) treats discovery as an attack surface for exactly this
reason, measuring 13,760 endpoints across 420 domains with the top domain at
77.5% and the top nine at 87.8%.

Grouping is by registrable domain (subdomains collapsed, e.g.
`mesh.heurist.xyz` → `heurist.xyz`). Without a full Public Suffix List this is
an approximation with a small hard-coded list of multi-part suffixes; distinct
host counts are reported alongside so the grouping is visible.

Domains are **anonymised** in output (`domain-1`, `domain-2`, …). Paper 1
anonymised them too — the finding is the concentration, not who is
concentrated (ETHICS.md rule 7).

`warn` above a top-domain share of **50%**, stated as a constant
(`CONCENTRATION_WARN_THRESHOLD`) so a reader can disagree with the number.

### Current sample is too small to make a concentration claim

At n=500 agents sampled, only 8 declared endpoints exist across 2 domains. A
"top domain = 50%" over 8 endpoints is not a finding — with two domains,
"top 3 = 100%" is arithmetic, not evidence. **P5 is implemented and tested but
under-powered until a wider scan runs**; Paper 1's corpus was three orders of
magnitude larger.

The concentration number that *is* well-powered from this sample is ownership,
measured over all 500 scanned agents rather than only the 6 that declared an
endpoint: **85 unique owners, top owner 14.2%, top three 36.2%, top ten
71.4%** — and that shape held steady from n=200 to n=500, so it is not
sampling noise.

Note the two denominators answer different questions and should not be mixed:
ownership across *all scanned agents* (85 owners / 500) versus ownership among
*endpoint-declaring agents only* (2 owners / 6). The run output reports the
latter because P5 is scoped to the endpoint shortlist; the registry-wide figure
is the one to quote.

## P4 (delivery) — and why settlement phase decides the result

P4 makes one ordinary payment and checks whether the resource comes back.
Running it against our own testbed surfaced something that changes how the
result must be read.

x402 lets a server choose **when** settlement happens relative to the handler
(`extra.paymentFlow`): `authorization` (the default — settle *after* the
handler succeeds) or `upfront` (settle *before* the handler runs).

That distinction decides whether a failing endpoint actually costs the buyer
anything:

| Server config | Handler 500s | Did the buyer pay? | P4 outcome |
|---|---|---|---|
| `authorization` (default) | yes | **no** — settlement never fires | `warn` |
| `upfront` | yes | **yes** — money already moved | `fail` |

We confirmed both on Hedera testnet against our own endpoints, checking the
mirror node rather than trusting the response:

- Default flow, handler 500s → **no transaction on chain**. Nothing was lost.
- `upfront`, handler 500s → `CRYPTOTRANSFER SUCCESS`, 1,000,000 tinybar moved
  from the payer to `payTo`, and the response was `HTTP 500 {"error":"internal
  error"}` with no resource. That is paid-but-denied, on chain.

So **"endpoint returned an error" is not by itself the failure the papers
describe.** The failure is an error *after* settlement. P4 reports `fail` only
when a settlement receipt exists, and `warn` when the request failed without
one — those are different findings and are not merged.

A consequence worth stating: a naive x402 server on the default flow is
*safer* than it looks, because its errors are free. The dangerous
configuration is the one that takes the money first.

### Reporting the amount honestly

P4 records the amount from the payment requirements the client actually signed
against (captured via `onAfterPaymentCreation`), not from our own spend cap.
An earlier version printed the cap, which would have published a number we
never observed — see ETHICS.md §6.

### Spend controls

The per-payment cap is enforced by the x402 client before anything is signed
(`setSpendControls`), so an endpoint quoting above the cap is refused rather
than paid. Default cap is 2,000,000 tinybar (0.02 HBAR), double the testbed
price.

## Known limitations of this pass

- Sample is capped at `MAX_AGENTS` (currently the first N agent IDs from
  `START_ID`), not the full registry — see `totalAgents` in each run's JSON
  for the true registry size at scan time.
- No liveness check — endpoints are recorded, never pinged. That's a
  deliberately separate follow-up.
- `unknown-gateway-failed` conflates "our gateway chain failed" with "this
  content is genuinely gone" — we can't fully distinguish them from outside
  the IPFS network. Re-running a scan later and comparing `unknown-gateway-
  failed` agent IDs across runs is the practical way to tell transient from
  permanent.
