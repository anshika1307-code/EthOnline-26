# Hedera Feedback Log

Running log of friction hit while building Preflight on Hedera.
Written live, in the moment. Not reconstructed afterwards.

**Why this file exists:**
1. Track 12 asks us to improve the Hedera Harness. Real friction → real PRs.
2. The submission form asks for feedback for each sponsor. This file is the source.
3. Specific, timestamped complaints are useful to a sponsor. Vague ones are noise.

**Rules for entries**
- Log it when it happens, even if you solve it two minutes later.
- Paste the **exact** error text. Never paraphrase it.
- Record how long you lost. Time cost is the strongest signal for prioritising a fix.
- Log the good things too. Sponsors read this and it earns goodwill.
- Don't editorialise. "Docs say X, actual behaviour is Y" beats "the docs are bad."

---

## Entry template

```
### [YYYY-MM-DD HH:MM] Short title

**Where:** which SDK / doc page / CLI command / tool
**Version:** package or tool version
**What I expected:** one sentence
**What happened:** exact error or behaviour
```
paste the raw error here
```
**How I worked around it:** what actually unblocked me
**Time lost:** ~N minutes
**Severity:** blocker | slow-down | papercut | docs-only
**PR candidate:** yes / no / maybe, and what the fix would be
```

---

## Log

<!-- new entries go below, newest at the bottom -->

### [2026-09-11 19:20] eth_getLogs caps by *time*, not block range, and nothing told me upfront

**Where:** Hashio JSON-RPC, `https://testnet.hashio.io/api`, `eth_getLogs`
**Version:** public Hashio testnet endpoint, hit over plain curl
**What I expected:** to backfill logs the same way I do on Sepolia, pick a block range, chunk it, walk it. Every other EVM chain I've pointed this scanner at limits `eth_getLogs` by *number of blocks*, so that's the knob I built around.

**What happened:** asked for the full history of the ERC-8004 registry (`fromBlock: 0x0` → latest) and got:

```
{"error":{"code":-32004,"message":"[Request ID: d8801d2a-0dea-4b65-adef-58b8ea91ce07] The provided fromBlock and toBlock contain timestamps that exceed the maximum allowed duration of 7 days (604800 seconds): fromBlock: 0x0 (1706812520.644859297), toBlock: 0x2683a0d (1789134566.734710104)"},"jsonrpc":"2.0","id":1}
```

The limit is **7 days of wall-clock time**, not a block count. That's the bit that caught me out. My chunker thinks in blocks (`LOG_CHUNK = 10_000`), so whether any given chunk is legal depends on the chain's block time, which I now have to know before I can size a chunk safely. On Sepolia I never had to care.

Worked it out after the fact: testnet is averaging ~2.04s/block (40,385,037 blocks across ~952.8 days), so the 7-day window is roughly **296,700 blocks**. My 10k chunk is ~5.7 hours of chain time, so it was never going to trip the limit. I just had no way to know that without doing the arithmetic myself. A 250k-block chunk, which is a perfectly reasonable default on a fast chain, would have failed intermittently depending on block times, and that's a horrible bug to debug.

**How I worked around it:** nothing to fix, as it turns out, 10k blocks is comfortably inside the window. But I only know that because I went and computed the average block time by hand. The honest answer is I got lucky with my default.

**Time lost:** ~20 minutes, most of it working out whether my existing chunk size was safe or accidentally safe.

**Severity:** docs-only (leaning slow-down, it's a silent trap for anyone with a larger default chunk)

**PR candidate:** yes, docs. Two small things that would have saved the 20 minutes:
1. Say on the JSON-RPC limits page that `eth_getLogs` is bounded by a **7-day timestamp window**, and give the approximate block equivalent at current block times, because every EVM indexer in existence is written against a block-count limit.
2. A one-liner in the Hedera docs' indexing/backfill guidance: "size your chunks in time, not blocks."

**Credit where it's due:** the error message itself is genuinely one of the better ones I've hit. It names the actual limit, both offending bounds, their resolved timestamps, and a request ID for support. Compare that to the average `query returned more than 10000 results` with no numbers. Whoever wrote it, thank you, it made the diagnosis 30 seconds instead of an hour.

### [2026-09-11 20:05] The Blocky402 link on the prize page isn't the facilitator URL

**Where:** ETHOnline prize page, "AI & Agentic Payments on Hedera" → Links and Resources → "Blocky402 facilitator → https://blocky402.com/"
**Version:** `@x402/core` 2.25.0, `@x402/hedera` 2.25.0, `@x402/express` 2.25.0

**What I expected:** the qualification requirement says settle "through the Blocky402 facilitator" and links `https://blocky402.com/`, so I put that in `FACILITATOR_URL` and expected the resource server to talk to it.

**What happened:** server booted, then immediately failed to sync with the facilitator. The 404 body is a Next.js marketing page, and a chunk of raw HTML gets spliced into the error:

```
Failed to fetch supported kinds from facilitator: Error: Facilitator getSupported failed (404): <!DOCTYPE html><!--7Q79xInVS98e__x7i9HB6--><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="preload" href="/_next/static/...
```

Then every request to a gated route returned `HTTP 500 {"error":"Internal Server Error"}` instead of a 402, because the server had no supported-kinds list to build requirements from.

`blocky402.com` is the marketing site. The actual API bases are different hosts:

- `https://api.blocky402.com`, **mainnet only**. `GET /supported` returns `hedera:mainnet` and nothing else.
- `https://api.testnet.blocky402.com`, testnet. Returns `hedera:testnet` (plus Polygon Amoy and Solana Devnet).

The mainnet-only bit is the part that nearly sent me down the wrong path. The prize text says "testnet or mainnet", I had testnet accounts funded and ready, and the first API base I found advertised mainnet only, for a few minutes I thought qualifying meant buying real HBAR. The testnet host exists and works fine, it's just on a subdomain nothing linked me to. Found it in `blocky402.com/docs/networks`.

**How I worked around it:** set `FACILITATOR_URL=https://api.testnet.blocky402.com`. Immediately worked, clean `HTTP 402` with a well-formed `PAYMENT-REQUIRED` header, and it auto-discovered the facilitator's testnet fee payer (`0.0.7162784`) without me configuring it.

**Time lost:** ~15 minutes, and a brief scare about needing mainnet funds.

**Severity:** docs-only, but it's the first thing every entrant to this track will hit.

**PR candidate:** yes, and it's a one-liner. On the prize page, point "Blocky402 facilitator" at `https://blocky402.com/docs/networks` instead of the site root, or just list the two API bases inline:
```
testnet: https://api.testnet.blocky402.com
mainnet: https://api.blocky402.com
```
Secondary, for the x402 repo rather than Hedera: when `getSupported` gets a non-JSON body, say "expected JSON, got text/html, is this the API base or a website?" instead of pasting 400 characters of minified HTML into the exception. I'd have spotted the problem instantly.

**Good bit:** once pointed at the right host it was genuinely zero-config. I didn't have to tell it the fee payer, the scheme, or anything about Hedera, `GET /supported` carried all of it and `@x402/express` wired it up. The 402 it produced was spec-clean first try.

### [2026-09-11 21:05] x402 v1 vs v2 header name, cost me a demo that was quietly lying

**Where:** `@x402/core` / `@x402/hedera` / `@x402/express` 2.25.0, and `docs/prds/x402-metered-api.md` in the Hedera Harness
**Version:** all three x402 packages at 2.25.0

**What I expected:** the x402 payment header to be `X-PAYMENT`. That's what the Harness x402 PRD says to retry with, in three separate places, and it's what most x402 material I'd read used.

**What happened:** no error. That's the problem.

I'd built a deliberately-vulnerable endpoint whose bug was that it cached a payment proof and then served repeat requests free. Its shim read `req.header('X-PAYMENT')`. That header is never present under v2, so the shim never fired and the endpoint behaved *correctly*, while I believed I had a working demonstration of a replay vulnerability.

Nothing surfaced this. Payments settled, HTTP 200 came back, the logs looked healthy. I only caught it because a separate replay check reported:

```
⚠ A1  no payment proof was produced, so there was nothing to replay
     first: HTTP 200   replay: HTTP n/a
```

against a server that had *just* taken a payment. Those two facts can't both be true, and chasing the contradiction found it.

The actual behaviour, in `@x402/core`:

```js
switch (paymentPayload.x402Version) {
  case 2: return { "PAYMENT-SIGNATURE": ... };
  case 1: return { "X-PAYMENT": ... };
}
```

and server-side there is no fallback at all:

```js
extractPayment(adapter) {
  const header = adapter.getHeader("payment-signature") || adapter.getHeader("PAYMENT-SIGNATURE");
  ...
  return null;
}
```

Same split on the response side: v2 is `PAYMENT-REQUIRED` / `PAYMENT-RESPONSE`, v1 is `X-PAYMENT-RESPONSE`. My delivery check survived only by luck, it happened to have a lowercase `payment-response` fallback that matched.

**How I worked around it:** switched client, server and both checks to `PAYMENT-SIGNATURE`, keeping `X-PAYMENT` as a v1 fallback on reads only. The replay check immediately started separating the good endpoint from the vulnerable one.

**Time lost:** ~40 minutes, and it nearly cost more than time. I would have demoed an endpoint asserting a vulnerability it didn't have, and the first person to look closely would have found it.

**Severity:** slow-down, but the silent-failure mode makes it worse than the time cost suggests.

**PR candidate:** yes, **opened against the Harness**: correct the three `X-PAYMENT` references in `docs/prds/x402-metered-api.md` to `PAYMENT-SIGNATURE`, and record the v2/v1 split. The PRD already specifies `@x402/hedera` v2 APIs, so it's internally inconsistent today. The same PR adds a note to import SDK primitives from `@x402/hedera` rather than `@hiero-ledger/sdk`, per that package's own duplicate-install warning.

**Worth saying:** the harness's own framing is that the harness, not the agent, is the arbiter of success. This is a case where the spec handed to the agent was wrong in a way validation wouldn't catch, which is exactly the kind of thing worth fixing in a PRD rather than in code.

---

## What went well

Log these as you go. They matter for the feedback field and they're honest.

- **Hashio testnet RPC needs zero setup.** No API key, no signup, no allowlist,
  `https://testnet.hashio.io/api` answered `eth_getCode` and `eth_getLogs` over
  plain curl on the first try. I'd already burned an hour that day fighting
  public IPFS gateways that 403 anything without a browser fingerprint, so a
  public endpoint that just *works* was a genuine relief.
- **The ERC-8004 registry is at the same CREATE2 address on Hedera as on
  Sepolia and Base Sepolia** (`0x8004A818BFB912233c491871b3d84c89A494BD9e`),
  and `eth_getCode` returns byte-identical proxy bytecode on all three. Made
  multi-chain support almost free, same address, swap the RPC.
- **The `eth_getLogs` range error is well written** (see the entry above). It
  names the limit, both bounds, the resolved timestamps, and a request ID.
  Most chains give you `query returned more than 10000 results` and let you
  guess.

---

## PR candidates (triage, review on day 3)

Move entries here once you've decided to act on them. Prioritise: small, self-contained, obviously correct.

| # | Fix | Type | Effort | Status |
|---|---|---|---|---|
| 1 | Document that `eth_getLogs` is capped by a **7-day timestamp window**, not a block count, and give the approximate block equivalent. Every EVM indexer is written against a block-count limit, so this is a silent trap. | docs | S | **candidate, do in Block 1** |
| 2 | Add one line to backfill/indexing guidance: "size your log chunks in time, not blocks." | docs | S | candidate (fold into #1) |
| 3 | Prize page links Blocky402 at the marketing site, not an API base. Point it at `/docs/networks` or list `api.testnet.blocky402.com` / `api.blocky402.com` inline. Every entrant to track 11 hits this first. | docs | S | **strongest candidate, smallest, most obviously correct** |
| 4 | (x402 repo, not Hedera) `getSupported` should say "expected JSON, got text/html" rather than pasting 400 chars of minified HTML into the exception. | docs / error message | S | candidate |
| 5 | **Harness `docs/prds/x402-metered-api.md`: three `X-PAYMENT` → `PAYMENT-SIGNATURE` corrections + v2/v1 note + `@x402/hedera` re-export note.** Silent-failure bug; PRD is internally inconsistent with the v2 packages it specifies. | docs | S | **PREPARED, patch + PR description in `data/harness-pr/`, ready to push** |

**Good PR shapes for a 4-day hackathon (in order of preference):**
1. **Docs fix**, a missing prerequisite, a wrong sample, an undocumented parameter. Fast, always welcome, nearly always merged.
2. **Better error message**, small code change, high value, easy to review.
3. **Missing convenience method**, only if it's genuinely small.
4. **Test or local-dev mode**, track 12 names this explicitly, but it's the largest. Only if days 1–2 went fast.

**Avoid:** large refactors, anything touching architecture, anything you can't explain in a Q&A.

**PR hygiene:** one fix per PR, link back to this log entry, describe the friction you hit and the time it cost. Maintainers respond well to "here's what broke and here's the fix."

---

## Draft feedback for submission form

Assemble this on day 4 from the entries above. Keep it factual and specific.

> **Feedback for Hedera:**
>
> Built [what] on Hedera Testnet over 4 days as a solo developer. Rough edges hit, with approximate time cost:
>
> 1. [friction], ~N min. Opened PR: [link]
> 2. [friction], ~N min. Suggested fix: [one line]
> 3. [friction], ~N min
>
> What worked well: [the genuine positives]
>
> Full timestamped log: [link to this file in the repo]

---

## Notes

- If a friction point took more than 30 minutes, it is almost certainly worth a PR or at least an issue.
- If you can't fix it, **open an issue** with the same detail. An issue with a clear reproduction still counts as a contribution and takes five minutes.
- Link this file from the README so judges can find it without digging.
