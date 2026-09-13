# Deploying Preflight

Three deployable pieces. **Only the first two need to be public** for Hedera
track 11 ("host a live x402-gated service"); the MCP server runs locally over
stdio by design.

| Piece | What it is | Where | Needs to be public? |
|---|---|---|---|
| `src/` (Next.js) | Dashboard + free `/api/scan` | Vercel | yes — the demo surface |
| `apps/api` | Preflight sold per call, x402-gated | Render / Fly / Railway | **yes — the prize requirement** |
| `testbed` | good / bad-replay / bad-delivery | Render / Fly / Railway | recommended, for the demo |
| `apps/mcp` | MCP server | local, stdio | no |

Everything is verified to build and run in Docker locally. Nothing below has
been run against a live host — that needs your accounts.

---

## 1. Dashboard → Vercel

The dashboard reads a **generated summary**, not the 18 MB of raw evidence in
`data/`, so there is nothing special to configure.

```bash
npm i -g vercel     # if needed
vercel              # first run links the project
vercel --prod
```

`npm run build` regenerates `src/generated/dashboard.json` via a `prebuild`
hook, so a fresh deploy always reflects the newest scan in `data/`.

**Re-run after any new scan**, or the site shows stale numbers:

```bash
npm run build:data && git add src/generated/dashboard.json && git commit -m "chore: refresh dashboard data"
```

No environment variables are required. `/api/scan` performs its own outbound
requests and needs no keys.

---

## 2. Preflight API → Render (or Fly / Railway)

This is the one the prize track cares about. It must be reachable and it must
settle real payments through Blocky402.

**Render — Docker, from the repo root:**

1. New → Web Service → connect the repo
2. Runtime **Docker**, Dockerfile path `apps/api/Dockerfile`, **Docker context `.`** (repo root — it imports `packages/checks`)
3. Environment variables:

| Key | Value |
|---|---|
| `HEDERA_RECEIVER_ACCOUNT_ID` | your receiving account, e.g. `0.0.10475917` |
| `FACILITATOR_URL` | `https://api.testnet.blocky402.com` |
| `HEDERA_NETWORK` | `hedera:testnet` |
| `PRICE_TINYBAR` | `100000` (0.001 HBAR) |

`PORT` is injected by the host and the app honours it.

**Or with the Docker CLI anywhere:**

```bash
docker build -f apps/api/Dockerfile -t preflight-api .
docker run -p 8403:8403 \
  -e HEDERA_RECEIVER_ACCOUNT_ID=0.0.xxxxxxx \
  -e FACILITATOR_URL=https://api.testnet.blocky402.com \
  -e HEDERA_NETWORK=hedera:testnet \
  -e PRICE_TINYBAR=100000 \
  preflight-api
```

**No private key is needed by the API.** It only *receives*. Only the buyer
side (P4/A1 in `packages/checks`) holds a key.

---

## 3. Testbed → same pattern

```bash
docker build -f testbed/Dockerfile -t preflight-testbed .
```

Same env vars as the API except `PRICE_TINYBAR=1000000` (0.01 HBAR) and
Dockerfile path `testbed/Dockerfile`. Context is the repo root for consistency,
though the testbed has no cross-package imports.

### ⚠ After deploying the testbed, update the ethics allowlist

A1 and every future Group A check refuse any host not on the allowlist. Once
the testbed has a real hostname, **the guard will correctly refuse your own
service** until you tell it:

```bash
# packages/checks/.env
OWN_TESTBED_HOSTS=preflight-testbed.onrender.com
```

Only ever add hosts you control. That refusal is the safety rail working —
see [`ETHICS.md`](./ETHICS.md) §1 rule 2.

---

## 3b. Point Preflight's ERC-8004 entry at the live API

Preflight is registered as **agent #119** on Hedera testnet, but its
registration currently lists only the source repo, so our own classifier rates
it `confirmed-no-endpoint`. Once `apps/api` has a public URL:

```bash
npx tsx scripts/register-agent.ts --update 119 --endpoint https://your-api.onrender.com        # dry run
npx tsx scripts/register-agent.ts --update 119 --endpoint https://your-api.onrender.com --send
```

That adds an `x402` service pointing at `/check` and sets `x402Support: true`.
Our own entry should then pass our own checks — worth showing on video.

## 4. Verify the deployment

```bash
API=https://your-api.onrender.com

curl -s $API/health                                    # {"ok":true,...}
curl -s $API/pricing | jq .                            # price + what it never runs
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST $API/check -H 'content-type: application/json' \
  -d '{"endpoint":"https://example.com"}'              # expect 402
```

Then complete a **real paid request** against the deployed API — this is the
qualification requirement, and it is worth capturing on video:

```bash
cd packages/checks
# point the buyer at the deployed host instead of localhost
npx tsx src/bin/run-p4.ts https://your-testbed.onrender.com/good
```

Confirm the settlement on the mirror node rather than trusting the response:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=0.0.YOURACCOUNT&limit=3&order=desc" | jq '.transactions[].transfers'
```

### Checklist

- [ ] Dashboard loads, hero numbers match `node scripts/verify-claims.mjs`
- [ ] `/api/scan` returns a report for a real URL, and **refuses** `http://localhost/`
- [ ] API `/health` and `/pricing` are public
- [ ] Unpaid `POST /check` returns **402** with a `PAYMENT-REQUIRED` header
- [ ] One real payment settles, visible on HashScan
- [ ] `OWN_TESTBED_HOSTS` set if the testbed is deployed
- [ ] Agent #119 updated to the live API via `scripts/register-agent.ts --update`
- [ ] Tested in a clean browser and on mobile

---

## Known issues, stated rather than hidden

- **Images are ~1.1 GB.** `@hiero-ledger/sdk` pulls in `react-native` and
  `hermes-compiler` transitively (~105 MB) and the SDK itself is ~177 MB.
  `--omit=optional` does not remove them. Fine on Render/Fly; slow to push on a
  bad connection. A multi-stage build that compiles to plain JS and drops `tsx`
  would cut it substantially — not done, out of time.
- **Services run TypeScript directly via `tsx`.** `tsx` is therefore a real
  runtime dependency and is declared as one. (It was briefly in
  `devDependencies`, which meant `npx` silently downloaded it on every cold
  start — the container needed npm reachable just to boot.)
- **Testnet only.** Nothing here is configured for Hedera mainnet, and the
  spend caps assume testnet HBAR.
- **The dashboard's data is a build-time snapshot.** It does not re-scan on its
  own; re-run `npm run build:data` and redeploy.
- **Free tiers sleep.** A cold Render instance can take ~30 s to answer the
  first request. Warm it before recording the demo.
