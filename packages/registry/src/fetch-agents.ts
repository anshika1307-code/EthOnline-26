/**
 * First-pass ERC-8004 scan: read registered agents from the Identity Registry
 * on Ethereum Sepolia, resolve their registration files, and count how many
 * declare a service endpoint URL.
 *
 * This is NOT the liveness check — endpoints are recorded, never pinged.
 *
 * Run: npm run fetch-agents
 *
 * Enumeration: agent IDs are minted sequentially from 1, so the default mode
 * binary-searches the highest minted ID (the total) and then probes
 * tokenURI(START_ID .. START_ID+MAX_AGENTS) for the sample. Set ENUM_MODE=logs
 * to instead read `Registered` events over [START_BLOCK, latest] in chunks —
 * slower and RPC-range-limited, but useful for a bounded window.
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, http, parseAbi, getAddress, type Address } from 'viem';
import { sepolia } from 'viem/chains';

config({ path: '.env.local' });

// Canonical ERC-8004 IdentityRegistry (CREATE2, same address on every supported
// chain). Source: github.com/erc-8004/erc-8004-contracts README. Verified via
// eth_getCode on Sepolia — an ERC-1967 proxy at this address.
const IDENTITY_REGISTRY: Address = getAddress(
  '0x8004A818BFB912233c491871b3d84c89A494BD9e',
);

const RPC_URL = process.env.RPC_URL?.trim();
// Tried in order; a gateway that times out, errors, or exhausts its 429
// retries falls through to the next one. cloudflare-ipfs.com failed to even
// resolve DNS in testing — kept as a last resort in case that's local/transient.
const IPFS_GATEWAYS = (
  process.env.IPFS_GATEWAYS?.trim() ||
  'https://ipfs.io/ipfs/,https://dweb.link/ipfs/,https://cloudflare-ipfs.com/ipfs/'
)
  .split(',')
  .map((s) => s.trim().replace(/\/?$/, '/'))
  .filter(Boolean);
const ENUM_MODE = (process.env.ENUM_MODE?.trim() || 'probe') as 'probe' | 'logs';
const START_ID = BigInt(process.env.START_ID?.trim() || '1');
const MAX_AGENTS = Number(process.env.MAX_AGENTS?.trim() || '200');
const START_BLOCK = BigInt(process.env.START_BLOCK?.trim() || '0');
const LOG_CHUNK = 10_000n;
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS?.trim() || '10000');
// First gateway attempt uses FETCH_TIMEOUT_MS; every fallback attempt after
// it gets more time, since a slow-but-alive gateway beats moving on too soon.
const IPFS_RETRY_TIMEOUT_MS = Number(process.env.IPFS_RETRY_TIMEOUT_MS?.trim() || '20000');
const IPFS_MIN_INTERVAL_MS = Number(process.env.IPFS_DELAY_MS?.trim() || '300');
const IPFS_MAX_429_RETRIES = 2;

// RFC 2606 reserved domains/TLDs — used to separate obvious placeholder
// registrations (example.com/...) from agents whose real endpoint infra is
// actually broken. Both are "metadata didn't resolve," but only one of them
// is the phenomenon this tool measures.
const JUNK_HOSTS = new Set(['example.com', 'example.net', 'example.org', 'example.edu', 'localhost']);
const JUNK_TLDS = ['.test', '.example', '.invalid', '.localhost'];

type Category =
  | 'no-uri' // agentURI never set — nothing published yet
  | 'junk-placeholder' // agentURI points at an RFC 2606 reserved domain
  | 'confirmed-empty' // metadata resolved; services is empty
  | 'confirmed-no-endpoint' // metadata resolved; services has entries, none are http(s) URLs
  | 'confirmed-has-endpoint' // metadata resolved; at least one http(s) service endpoint
  | 'unknown-gateway-failed'; // metadata fetch failed for a reason unrelated to the above

function isJunkPlaceholder(agentURI: string): boolean {
  if (!/^https?:\/\//i.test(agentURI)) return false;
  try {
    const host = new URL(agentURI).hostname.toLowerCase();
    return JUNK_HOSTS.has(host) || JUNK_TLDS.some((tld) => host.endsWith(tld));
  } catch {
    return false;
  }
}

function classify(
  agentURI: string,
  metadataResolved: boolean,
  services: unknown[],
  urls: string[],
): Category {
  if (!agentURI) return 'no-uri';
  if (metadataResolved) {
    if (urls.length > 0) return 'confirmed-has-endpoint';
    return services.length === 0 ? 'confirmed-empty' : 'confirmed-no-endpoint';
  }
  return isJunkPlaceholder(agentURI) ? 'junk-placeholder' : 'unknown-gateway-failed';
}

function makeClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
    batch: { multicall: true },
  });
}
type Client = ReturnType<typeof makeClient>;

const registryAbi = parseAbi([
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
]);

type AgentRef = { agentId: bigint; agentURI: string };

type AgentResult = {
  agentId: string;
  agentURI: string;
  owner: string | null;
  category: Category;
  metadataResolved: boolean;
  metadataError: string | null;
  gatewayAttempts: string[] | null;
  services: unknown[];
  serviceEndpointUrls: string[];
  hasServiceEndpointUrl: boolean;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable)';
  }
}

async function agentExists(client: Client, id: bigint): Promise<boolean> {
  try {
    await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: registryAbi,
      functionName: 'ownerOf',
      args: [id],
    });
    return true;
  } catch {
    return false;
  }
}

/** Highest minted agentId, via exponential search then binary search on ownerOf. */
async function findHighestAgentId(client: Client): Promise<bigint> {
  if (!(await agentExists(client, 1n))) return 0n;
  let lo = 1n;
  let hi = 2n;
  while (await agentExists(client, hi)) {
    lo = hi;
    hi *= 2n;
  }
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (await agentExists(client, mid)) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

/** Probe tokenURI for a contiguous window of IDs; skip IDs that revert (burned/gap). */
async function enumerateViaProbe(client: Client, count: number): Promise<AgentRef[]> {
  const refs: AgentRef[] = [];
  const end = START_ID + BigInt(count);
  for (let id = START_ID; id < end; id++) {
    try {
      const agentURI = await client.readContract({
        address: IDENTITY_REGISTRY,
        abi: registryAbi,
        functionName: 'tokenURI',
        args: [id],
      });
      refs.push({ agentId: id, agentURI });
    } catch {
      /* gap — agent never minted or burned */
    }
  }
  return refs;
}

/** Read Registered events over [START_BLOCK, toBlock] in chunks. */
async function enumerateViaLogs(client: Client, toBlock: bigint): Promise<AgentRef[]> {
  const found = new Map<string, AgentRef>();
  for (let from = START_BLOCK; from <= toBlock; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n > toBlock ? toBlock : from + LOG_CHUNK - 1n;
    const logs = await client.getLogs({
      address: IDENTITY_REGISTRY,
      event: registryAbi[2],
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      const id = log.args.agentId;
      if (id === undefined) continue;
      found.set(id.toString(), { agentId: id, agentURI: log.args.agentURI ?? '' });
    }
  }
  return [...found.values()]
    .sort((a, b) => (a.agentId < b.agentId ? -1 : 1))
    .slice(0, MAX_AGENTS);
}

// Some registered agents declare `;base64` but put raw (non-base64) JSON in
// the payload anyway — a bug in whatever tooling minted them, not something
// we can fix on-chain. Try the declared encoding first, then fall back to
// treating the payload as raw text so one mislabeled field doesn't sink an
// otherwise-valid registration file.
function decodeDataUri(uri: string): Record<string, unknown> {
  const comma = uri.indexOf(',');
  if (comma === -1) throw new Error('malformed data: URI');
  const meta = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  const candidates = meta.includes(';base64')
    ? [Buffer.from(payload, 'base64').toString('utf8'), decodeURIComponent(payload)]
    : [decodeURIComponent(payload)];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The public IPFS gateways return 429s (or just hang) well before any
// reasonable concurrency limit is hit, even one request at a time — so
// ipfs:// lookups are throttled to one in flight per IPFS_MIN_INTERVAL_MS,
// retried on 429 within a gateway, and moved to the next gateway in
// IPFS_GATEWAYS on timeout/error/exhausted retries. The first gateway uses
// the normal timeout; every fallback attempt after it gets more time.
let ipfsLastRequestAt = 0;
async function fetchIpfsThrottled(url: string, timeoutMs: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const wait = ipfsLastRequestAt + IPFS_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    ipfsLastRequestAt = Date.now();
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    if (res.status === 429 && attempt < IPFS_MAX_429_RETRIES) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    return res;
  }
}

async function fetchIpfsWithFallback(
  cidPath: string,
): Promise<{ res: Response; attempts: string[] }> {
  const attempts: string[] = [];
  let lastError: unknown;
  for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
    const url = IPFS_GATEWAYS[i] + cidPath;
    const timeoutMs = i === 0 ? FETCH_TIMEOUT_MS : IPFS_RETRY_TIMEOUT_MS;
    try {
      const res = await fetchIpfsThrottled(url, timeoutMs);
      attempts.push(`${hostOf(url)}: HTTP ${res.status}`);
      if (res.ok) return { res, attempts };
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      attempts.push(`${hostOf(url)}: ${err instanceof Error ? err.message : String(err)}`);
      lastError = err;
    }
  }
  throw Object.assign(
    new Error(
      `all ${IPFS_GATEWAYS.length} gateways failed: ${attempts.join(' | ')}`,
    ),
    { cause: lastError },
  );
}

async function resolveMetadata(
  agentURI: string,
): Promise<{ metadata: Record<string, unknown>; gatewayAttempts: string[] | null }> {
  if (!agentURI) throw new Error('empty agentURI');

  if (agentURI.startsWith('data:')) {
    return { metadata: decodeDataUri(agentURI), gatewayAttempts: null };
  }

  if (agentURI.startsWith('ipfs://')) {
    const cidPath = agentURI.slice('ipfs://'.length).replace(/^ipfs\//, '');
    const { res, attempts } = await fetchIpfsWithFallback(cidPath);
    return { metadata: (await res.json()) as Record<string, unknown>, gatewayAttempts: attempts };
  }

  if (/^https?:\/\//i.test(agentURI)) {
    const res = await fetch(agentURI, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${hostOf(agentURI)}`);
    return { metadata: (await res.json()) as Record<string, unknown>, gatewayAttempts: null };
  }

  throw new Error(`unsupported URI scheme: ${agentURI.slice(0, 24)}`);
}

function extractServiceEndpointUrls(metadata: Record<string, unknown>): {
  services: unknown[];
  urls: string[];
} {
  const services = Array.isArray(metadata.services) ? metadata.services : [];
  const urls: string[] = [];
  for (const svc of services) {
    if (svc && typeof svc === 'object') {
      const endpoint = (svc as Record<string, unknown>).endpoint;
      if (typeof endpoint === 'string' && /^https?:\/\//i.test(endpoint)) {
        urls.push(endpoint);
      }
    }
  }
  return { services, urls };
}

async function main() {
  if (!RPC_URL) {
    console.error('Missing RPC_URL. Copy .env.local.example to .env.local and set it.');
    process.exit(1);
  }

  const client = makeClient();

  console.log(`Chain:    ethereum-sepolia (${sepolia.id})`);
  console.log(`Registry: ${IDENTITY_REGISTRY}`);
  console.log(`RPC host: ${hostOf(RPC_URL)}`);
  console.log(`Mode:     ${ENUM_MODE}\n`);

  let totalAgents: number;
  let refs: AgentRef[];
  let enumeration: Record<string, unknown>;

  if (ENUM_MODE === 'logs') {
    const latestBlock = await client.getBlockNumber();
    console.log(`Scanning Registered events ${START_BLOCK}..${latestBlock} (chunk ${LOG_CHUNK})`);
    refs = await enumerateViaLogs(client, latestBlock);
    totalAgents = refs.length;
    enumeration = {
      method: 'logs',
      fromBlock: START_BLOCK.toString(),
      toBlock: latestBlock.toString(),
      note: 'total reflects the scanned block range only',
    };
  } else {
    const highest = await findHighestAgentId(client);
    totalAgents = Number(highest);
    console.log(`Highest minted agentId: ${highest}`);
    refs = await enumerateViaProbe(client, MAX_AGENTS);
    enumeration = {
      method: 'probe',
      startId: START_ID.toString(),
      window: MAX_AGENTS,
      highestAgentId: highest.toString(),
    };
  }

  console.log(`Resolving metadata for ${refs.length} agent(s)...\n`);

  const results: AgentResult[] = [];
  for (const ref of refs) {
    const result: AgentResult = {
      agentId: ref.agentId.toString(),
      agentURI: ref.agentURI,
      owner: null,
      category: 'no-uri',
      metadataResolved: false,
      metadataError: null,
      gatewayAttempts: null,
      services: [],
      serviceEndpointUrls: [],
      hasServiceEndpointUrl: false,
    };
    try {
      result.owner = await client.readContract({
        address: IDENTITY_REGISTRY,
        abi: registryAbi,
        functionName: 'ownerOf',
        args: [ref.agentId],
      });
    } catch {
      /* owner is best-effort */
    }
    try {
      const { metadata, gatewayAttempts } = await resolveMetadata(ref.agentURI);
      const { services, urls } = extractServiceEndpointUrls(metadata);
      result.metadataResolved = true;
      result.gatewayAttempts = gatewayAttempts;
      result.services = services;
      result.serviceEndpointUrls = urls;
      result.hasServiceEndpointUrl = urls.length > 0;
    } catch (err) {
      result.metadataError = err instanceof Error ? err.message : String(err);
    }
    result.category = classify(
      ref.agentURI,
      result.metadataResolved,
      result.services,
      result.serviceEndpointUrls,
    );
    results.push(result);
    const marker: Record<Category, string> = {
      'confirmed-has-endpoint': '+',
      'confirmed-empty': '.',
      'confirmed-no-endpoint': 'o',
      'no-uri': '_',
      'junk-placeholder': 'j',
      'unknown-gateway-failed': 'x',
    };
    process.stdout.write(marker[result.category]);
  }
  console.log('\n');

  const counts: Record<Category, AgentResult[]> = {
    'no-uri': [],
    'junk-placeholder': [],
    'confirmed-empty': [],
    'confirmed-no-endpoint': [],
    'confirmed-has-endpoint': [],
    'unknown-gateway-failed': [],
  };
  for (const r of results) counts[r.category].push(r);

  const confirmedTotal =
    counts['confirmed-empty'].length +
    counts['confirmed-no-endpoint'].length +
    counts['confirmed-has-endpoint'].length;
  const noEndpointConfirmed = counts['confirmed-empty'].length + counts['confirmed-no-endpoint'].length;
  const allEndpoints = counts['confirmed-has-endpoint'].flatMap((r) =>
    r.serviceEndpointUrls.map((u) => ({ agentId: r.agentId, url: u })),
  );

  console.log('===== SUMMARY =====');
  console.log(`Total agents registered:      ${totalAgents}${ENUM_MODE === 'logs' ? ' (in scanned range)' : ''}`);
  console.log(`Agents sampled this run:       ${results.length}`);
  console.log();
  console.log('Headline (confirmed metadata reads only):');
  console.log(
    `  No working service endpoint:  ${noEndpointConfirmed} / ${confirmedTotal} confirmed` +
      (confirmedTotal ? ` (${((noEndpointConfirmed / confirmedTotal) * 100).toFixed(1)}%)` : ''),
  );
  console.log(`    - confirmed-empty (services: []):        ${counts['confirmed-empty'].length}`);
  console.log(`    - confirmed-no-endpoint (no http(s) url): ${counts['confirmed-no-endpoint'].length}`);
  console.log(`  Has a working service endpoint:  ${counts['confirmed-has-endpoint'].length} / ${confirmedTotal} confirmed`);
  console.log();
  console.log('Excluded from headline (not a confirmed read of the agent\'s claim):');
  console.log(`  no-uri (nothing published yet):           ${counts['no-uri'].length}`);
  console.log(`  junk-placeholder (RFC 2606 test domains):  ${counts['junk-placeholder'].length}`);
  console.log(`  unknown-gateway-failed (couldn't resolve): ${counts['unknown-gateway-failed'].length}`);

  if (allEndpoints.length) {
    const sample = allEndpoints.slice(0, 30);
    console.log(`\nEndpoints${allEndpoints.length > sample.length ? ` (first ${sample.length})` : ''}:`);
    for (const e of sample) console.log(`  agent ${e.agentId}: ${e.url}`);
  }
  if (counts['unknown-gateway-failed'].length) {
    const failed = counts['unknown-gateway-failed'].slice(0, 20);
    console.log(`\nunknown-gateway-failed detail (first ${failed.length}):`);
    for (const r of failed) console.log(`  agent ${r.agentId}: ${r.metadataError}`);
  }

  const outDir = join('data', 'scan-runs');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = join(outDir, `sepolia-${stamp}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        scannedAt: new Date().toISOString(),
        chain: 'ethereum-sepolia',
        chainId: sepolia.id,
        identityRegistry: IDENTITY_REGISTRY,
        rpcHost: hostOf(RPC_URL),
        enumeration,
        totalAgents,
        agentsSampled: results.length,
        categoryCounts: Object.fromEntries(
          Object.entries(counts).map(([k, v]) => [k, v.length]),
        ),
        confirmedTotal,
        noEndpointConfirmed,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nRaw results written to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
