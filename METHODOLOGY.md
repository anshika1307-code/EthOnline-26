# How the scan actually works

How `packages/registry/src/fetch-agents.ts` reads the ERC-8004 registry and
decides whether an agent has a working service, written so any result can
be replayed and checked, not just trusted.

## Where we're reading from

- Chain: Ethereum Sepolia
- Contract: `0x8004A818BFB912233c491871b3d84c89A494BD9e` (the IdentityRegistry),
  deployed at the same address on every supported chain, including Hedera
  testnet. Confirmed by comparing raw bytecode across chains, not just
  trusting the address.

## Finding all the agents

The registry has no "give me the total count" function, but agent IDs are
handed out sequentially starting at 1. So we binary-search for the highest
ID that still resolves, then read every ID from there down, skipping gaps.
(There's an alternative mode that reads on-chain event logs instead, kept
for narrower time-window queries, not used for a full scan because at
10,000+ agents it would mean over a thousand slow network calls.)

## Reading each agent's info

An agent's metadata can be stored three different ways, and real agents in
the registry use all three:

| Type | Example | How we handle it |
|---|---|---|
| Embedded directly | `data:application/json;base64,...` | Decoded locally, no network call |
| On IPFS | `ipfs://Qm...` | Fetched through a gateway, see below |
| A normal URL | `https://agent.example/info.json` | Fetched directly, 10s timeout |

An agent that hasn't published anything yet (empty field) is valid and
normal, we label it `no-uri`, not a failure.

**One quirk we had to work around:** some agents say their data is
base64-encoded but it's actually plain text. Without a fallback for that,
86 of the first 87 embedded-data agents we tried would have failed to
parse, so we try the declared format first, then fall back to reading it
as plain text.

**IPFS is unreliable, and we planned for that.** Public IPFS gateways
throttle and time out heavily under this kind of automated traffic, so we
try three gateways in sequence, with retries and backoff, before giving up
on an agent. We also independently confirmed that some of these failures
are genuine(not our tooling) by fetching a known agent's file through a
completely different route and getting the same "no providers found"
answer. An agent whose file genuinely has no one hosting it anymore isn't,
honestly, a working agent.

Because re-trying every single failed IPFS lookup would take hours, after
several IPFS agents in a row fail completely, we stop attempting IPFS
lookups for a while and just record the rest with a note explaining why,
so "we didn't try" is never confused with "we tried and it failed."

## How we bucket every agent

| Bucket | What it means |
|---|---|
| `confirmed-has-endpoint` | Has at least one real, callable web address |
| `confirmed-empty` | Info resolved fine; it just lists nothing |
| `confirmed-no-endpoint` | Lists things, but none are callable web addresses (e.g. just an email or a name) |
| `no-uri` | Never published anything, not a failure |
| `junk-placeholder` | Points at an obviously fake/reserved domain like `example.com` |
| `unknown-gateway-failed` | We genuinely couldn't read its info |

The **headline number**("agents with no working service") only counts
agents whose info we could actually read (`confirmed-empty` +
`confirmed-no-endpoint`, out of everyone we successfully read). We don't
lump in the ones we couldn't read or that look like placeholders, because
that would inflate the number with noise instead of a real finding.

## What counts as a real, "payable" endpoint

We only count a listed service if it's:

1. **An actual web address** (not an email, ENS name, or raw file pointer)
2. **Not just a homepage or social link** ("website", "twitter", "docs",
   etc. are links *about* the agent, not something you can call)
3. **Actually reachable** (not `localhost`, not a private network address,
   not a placeholder domain)

This matters a lot, applying these three filters in order took the count
from 291 raw web-address strings down to **149 real endpoints**. 92 were
just a homepage link, and **43 pointed at `localhost`**, a service only
its own creator's machine can ever reach. Counting the loose definition
would have overstated the finding by more than 2×.

## How we score a verdict

| Condition | Verdict |
|---|---|
| Failed liveness every time | `DEAD` |
| Paid and got nothing, or any active check failed | `UNSAFE` |
| Quote was malformed or price didn't match | `CAUTION` |
| Everything passed, **including a completed payment** | `SAFE` |
| Anything else (e.g. alive but never actually paid) | `UNKNOWN` |

No hidden scoring, anyone can recompute a verdict by hand from the listed
checks. **`SAFE` specifically requires a real payment to have gone through
and been confirmed.** An endpoint that just answers a normal request is
alive, not proven safe to pay, that's `UNKNOWN`. An earlier version of
this tool called things `SAFE` after only a liveness check, which would
have told someone it was safe to pay four strangers we'd never actually
tried paying. We caught that and fixed it before publishing anything.

One honest consequence: since we only ever pay our own test services,
**third-party endpoints almost never score `SAFE`**, most land on `DEAD`
or `UNKNOWN`. That's not a bug, it's what the ethics boundary requires.

## Liveness, the details that mattered

We ping each endpoint three times per round, identify ourselves, and stop
immediately if we get a "back off" signal. Three real bugs we found and
fixed, because each one made the result look worse than reality:

1. **We were timing our own patience, not the server's speed.** Some agent
   endpoints keep the connection open forever (a streaming format). We were
   waiting for it to close before measuring, so we measured our own 10-
   second timeout instead of the real response time. Fixed to measure at
   the first response, not the full body, real numbers turned out to be
   300–1,200ms, not 10 seconds.
2. **We only tried `GET` requests.** Many agent APIs only answer `POST`.
   We now retry with `POST` if `GET` comes back 404/405, and we record
   which one actually worked.
3. **We treated "payment required" as "dead."** For a paywalled endpoint,
   getting asked to pay *is* the correct, healthy response to an unpaid
   request, we were wrongly marking every working paid agent as dead.

All three bugs made real, working agents look broken. We only caught them
because two of our own checks contradicted each other, a valid price
quote from an endpoint we'd just called "dead" is not something that can
actually happen, so the contradiction forced us to look closer.

## Quote validity and price matching

We send one unpaid request and check whether the answer is a properly
formed payment request, a real "pay me" response, not a broken one.

**This has to account for protocol version, or it slanders people.** The
payment protocol has two incompatible versions, v1 puts the price in the
response body under one field name, v2 puts it in a header under a
different name. Our first version only understood v2, and it reported four
real, correctly-working agents as broken, because they spoke v1. That claim
almost made it into a draft of this write-up before a live re-check caught
it, which is exactly the kind of false accusation the ethics rules exist
to prevent. The checker now reads which version an endpoint claims to
speak, and validates against the right rules for that version.

**Price matching almost never runs, and that's itself the finding.** The
registry standard has no field for "price," so there's usually nothing to
compare a quote against. We deliberately don't try to guess a price out of
free-text descriptions, publishing "this doesn't match" based on a guess
would be an unfounded accusation. So this check reports "nothing to
compare" rather than making something up. Plainly: **an agent currently has
no standard way to publish its price on-chain in a form software can
verify**, that's a gap in the standard, not agents hiding something.

## Discovery concentration

If most of the registry effectively routes through one dominant domain,
then "pick an agent from the registry" is really "use that one company",
and every risk that company carries becomes everyone's risk. We group
endpoints by their base domain and flag anything over 50% share (a
constant anyone can disagree with and change). Domains are anonymized in
our output, same as the research we build on.

At our current sample size, the endpoint-level concentration number isn't
big enough to draw a strong conclusion from (a handful of domains among a
handful of endpoints). The number that *is* well-supported, measured across
the full registry rather than just the small endpoint shortlist: **85
distinct owners, with the top ten holding 71%**, and that shape held
steady as we scanned more agents, so it isn't sampling noise.

## The delivery check, the part that changes how you should read a failure

We make one ordinary payment and check whether the resource actually comes
back. Testing this against our own services surfaced something important:
payment protocols let a server choose to take payment either *before* or
*after* it tries to do the work. That choice decides whether a broken
endpoint actually costs the buyer anything.

We confirmed both cases directly on Hedera testnet, checking the actual
ledger rather than trusting the response:

- **Settle-after (the safer default):** handler fails → **no money ever
  moved.** Nothing lost.
- **Settle-before:** handler fails → **money already moved**, and the
  response is still just an error with nothing delivered. That's the real
  paid-but-denied failure.

So "the endpoint returned an error" isn't by itself the dangerous case,
the dangerous case is an error *after* the money has already moved. We only
report a hard failure when we can confirm a payment actually settled; an
error with no settlement gets a softer warning instead, because those are
genuinely different findings and shouldn't be merged into one.

We also made sure to only ever report the amount we actually observed being
paid, an earlier version printed our own spending *limit* instead of the
real amount, which would have published a number we never actually
witnessed.

## What this pass doesn't cover

- We capped the scan at a configurable agent count, not always the full
  registry, each run's saved file records the true registry size at that
  moment.
- We can't always tell "our gateway failed" apart from "this content is
  genuinely gone forever" for IPFS lookups, comparing the same agent
  across multiple scan runs over time is the practical way to tell those
  apart.
