# Deploying Preflight

Three pieces can be deployed. Only the first two need to be public for the
Hedera track (it requires "a live x402-gated service"), the MCP server
runs locally by design.

| Piece | What it is | Where | Needs to be public? |
|---|---|---|---|
| `src/` (Next.js) | Dashboard + free `/api/scan` | Vercel | yes, the demo surface |
| `apps/api` | Preflight sold per call, x402-gated | Render / Fly / Railway | **yes, the prize requirement** |
| `testbed` | good / bad-replay / bad-delivery | Render / Fly / Railway | recommended, for the demo |
| `apps/mcp` | MCP server | local, stdio | no |

Everything below builds and runs in Docker locally. Nothing has been run
against a live host yet, that needs your own accounts.

---

## 1. Dashboard → Vercel

The dashboard reads a small generated summary file, not the raw evidence in
`data/`, so there's nothing special to configure.

```bash
npm i -g vercel     # if needed
vercel              # first run links the project
vercel --prod
```

`npm run build` regenerates `src/generated/dashboard.json` automatically, so
a fresh deploy always reflects the newest scan. **Re-run after any new
scan**, or the site shows stale numbers:

```bash
npm run build:data && git add src/generated/dashboard.json && git commit -m "chore: refresh dashboard data"
```

No environment variables needed, `/api/scan` makes its own outbound
requests.

---

## 2. Preflight API → Render (or Fly / Railway)

This is the one the Hedera prize track cares about. It needs to be
reachable, and it needs to actually settle real payments through Blocky402.

**On Render, using Docker, from the repo root:**

1. New → Web Service → connect the repo
2. Runtime **Docker**, Dockerfile path `apps/api/Dockerfile`, Docker context
   `.` (repo root, since it imports `packages/checks`)
3. Environment variables:

| Key | Value |
|---|---|
| `HEDERA_RECEIVER_ACCOUNT_ID` | your receiving account, e.g. `0.0.10475917` |
| `FACILITATOR_URL` | `https://api.testnet.blocky402.com` |
| `HEDERA_NETWORK` | `hedera:testnet` |

(`PORT` is injected by the host automatically.)

**Or with plain Docker anywhere:**

```bash
docker build -f apps/api/Dockerfile -t preflight-api .
docker run -p 8403:8403 \
  -e HEDERA_RECEIVER_ACCOUNT_ID=0.0.xxxxxxx \
  -e FACILITATOR_URL=https://api.testnet.blocky402.com \
  -e HEDERA_NETWORK=hedera:testnet \
  preflight-api
```

**Receiving payments needs no private key**, the API only receives.

**The receipt log (HCS) does need one, if you turn it on.** Writing a
receipt means signing a message, so enabling this gives the API an
operator key. It's optional, leave these unset and checks and payments
still work exactly the same, just without receipts.

| Key | Value |
|---|---|
| `HCS_TOPIC_ID` | `0.0.10519901` (Preflight's receipt topic) |
| `HCS_OPERATOR_ID` | the account that signs receipts |
| `HCS_OPERATOR_KEY` | its key, **a secret, set it in the host's env UI, never commit it** |

Only this operator can write to the topic, so a receipt can't be forged.
Create a new topic with `npx tsx src/create-topic.ts --send`.

**The Bazantic gateway is optional too.** It enables `POST /gw/check`,
`POST /gw/liveness`, and `GET /gw/openapi.json`. Leave it unset and those
routes just 404.

| Key | Value |
|---|---|
| `BAZANTIC_UPSTREAM_KEY` | a long random string, e.g. `openssl rand -hex 32`, **a secret**, and paste the same value into Bazantic's gateway API-key setting |
| `PUBLIC_URL` | `https://ethonline-26.onrender.com` (used in the OpenAPI spec) |

See [integrations/bazantic/README.md](integrations/bazantic/README.md).

---

## 3. Test services → same pattern

```bash
docker build -f testbed/Dockerfile -t preflight-testbed .
```

Same environment variables as the API, plus `PRICE_TINYBAR=1000000` (0.01
HBAR, the test services are flat-priced on purpose), and Dockerfile path
`testbed/Dockerfile`.

### After deploying, update the allowlist

The aggressive checks refuse any host that isn't on our own pre-approved
list. Once the test service has a real hostname, that guard will correctly
refuse to check it, until you add it:

```bash
# packages/checks/.env
OWN_TESTBED_HOSTS=preflight-testbed.onrender.com
```

Only ever add hosts you actually control, that refusal is the safety rail
doing its job. See [`ETHICS.md`](./ETHICS.md).

---

## 3b. Point our own on-chain identity at the live API

Preflight is already registered as **agent #119** on Hedera testnet, but
its registration currently only lists the source repo, so our own scanner
rates it "no working endpoint." Once `apps/api` has a public URL:

```bash
npx tsx scripts/register-agent.ts --update 119 --endpoint https://your-api.onrender.com        # dry run
npx tsx scripts/register-agent.ts --update 119 --endpoint https://your-api.onrender.com --send
```

That adds a payment service to the registration. Our own entry should then
pass our own checks, worth showing on video.

## 4. Confirm the deployment actually works

```bash
API=https://your-api.onrender.com

curl -s $API/health                                    # {"ok":true,...}
curl -s $API/pricing | jq .                            # the pricing formula
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST $API/check -H 'content-type: application/json' \
  -d '{"endpoint":"https://example.com"}'              # expect 402
```

Then complete one **real paid request** against the deployed API, this is
the actual qualification requirement, and worth capturing on video:

```bash
cd packages/checks
npx tsx src/bin/run-p4.ts https://your-testbed.onrender.com/good
```

Confirm the settlement directly on the ledger rather than trusting the API's
own response:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=0.0.YOURACCOUNT&limit=3&order=desc" | jq '.transactions[].transfers'
```

### Checklist

- [ ] Dashboard loads, hero numbers match `node scripts/verify-claims.mjs`
- [ ] `/api/scan` returns a report for a real URL, and refuses `http://localhost/`
- [ ] API `/health` and `/pricing` are public
- [ ] Unpaid `POST /check` returns 402 with a payment-required header
- [ ] A paid check adds an entry to the HCS topic (`GET /receipts` shows it)
- [ ] One real payment settles, visible on HashScan
- [ ] `OWN_TESTBED_HOSTS` is set if the test service is deployed
- [ ] Agent #119 is updated to point at the live API
- [ ] Tested in a clean browser and on mobile

---

## Known issues, stated rather than hidden

- **The Docker images are large (~1.1 GB)**, the Hedera SDK pulls in some
  large unrelated transitive dependencies. Fine on Render/Fly, slow to push
  over a bad connection.
- **Services run TypeScript directly**, so the `tsx` runner is a real
  runtime dependency, not just a dev tool, it's declared as one now, after
  an earlier setup that silently re-downloaded it on every cold start.
- **Testnet only.** Nothing here is configured for Hedera mainnet.
- **The dashboard's data is a build-time snapshot**, it doesn't re-scan on
  its own; re-run `npm run build:data` and redeploy to refresh it.
- **Free hosting tiers sleep.** A cold instance can take ~30s to answer the
  first request, warm it up before recording a demo.
