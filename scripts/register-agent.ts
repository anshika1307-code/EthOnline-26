/**
 * Register Preflight itself as an ERC-8004 agent on Hedera testnet.
 *
 * Preflight audits the ERC-8004 registry, so it should appear in it, and its
 * own entry should be held to the same checks as everyone else's.
 *
 *   npx tsx scripts/register-agent.ts            # DRY RUN — builds and validates, sends nothing
 *   npx tsx scripts/register-agent.ts --send     # mints the agent. IRREVERSIBLE.
 *   npx tsx scripts/register-agent.ts --update <agentId> --endpoint https://...   # setAgentURI
 *
 * Minting is permanent: the agentId and its owner live on the public ledger
 * forever. The *contents* of the registration are not — `setAgentURI` replaces
 * them, which is how the entry gets its real service endpoint once the API is
 * deployed.
 *
 * The registration file is stored fully on-chain as a base64 `data:` URI, as
 * the ERC-8004 spec recommends for on-chain storage. It is base64-encoded
 * *correctly* — 86 of 87 `data:` agents in our Sepolia sample declared
 * `;base64` and then stored raw JSON.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatEther,
  decodeEventLog,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;

const hederaTestnet: Chain = {
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hashio.io/api'] } },
  blockExplorers: { default: { name: 'HashScan', url: 'https://hashscan.io/testnet' } },
};

const abi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
]);

function loadEnv(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

type Service = { name: string; endpoint: string; version?: string };

/** The ERC-8004 registration file, per the spec's required shape. */
function registrationFile(opts: { agentId?: bigint; apiEndpoint?: string }) {
  const services: Service[] = [
    // Truthful as of registration: the source and the published findings are
    // real and reachable. The paid API is added via setAgentURI once hosted —
    // registering a localhost URL would get flagged by our own checker.
    { name: 'web', endpoint: 'https://github.com/anshika1307-code/EthOnline-26' },
  ];
  if (opts.apiEndpoint) {
    services.unshift({ name: 'x402', endpoint: `${opts.apiEndpoint.replace(/\/$/, '')}/check`, version: '2' });
  }

  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Preflight',
    description:
      'Before your AI agent pays a stranger’s API, Preflight checks whether that endpoint is ' +
      'alive, quotes a well-formed x402 payment, and prices honestly. Passive checks only against ' +
      'third parties; adversarial checks run solely against our own testbed. Sold per call over ' +
      'x402 on Hedera.',
    image: '',
    services,
    x402Support: Boolean(opts.apiEndpoint),
    active: true,
    // agentId is only known after minting, so this is filled on the follow-up setAgentURI.
    registrations: opts.agentId
      ? [{ agentId: Number(opts.agentId), agentRegistry: `eip155:296:${REGISTRY}` }]
      : [],
    supportedTrust: [],
  };
}

function toDataUri(obj: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(obj)).toString('base64')}`;
}

/** Round-trip the URI exactly the way our own scanner would, and fail loudly if it cannot. */
function assertDecodable(uri: string) {
  const comma = uri.indexOf(',');
  const decoded = JSON.parse(Buffer.from(uri.slice(comma + 1), 'base64').toString('utf8'));
  if (decoded.type !== 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1') {
    throw new Error('registration file does not round-trip');
  }
  return decoded;
}

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes('--send');
  const updateIdx = args.indexOf('--update');
  const endpointIdx = args.indexOf('--endpoint');
  const apiEndpoint = endpointIdx >= 0 ? args[endpointIdx + 1] : undefined;

  const env = loadEnv(join(REPO, 'testbed', '.env'));
  const key = env.HEDERA_CLIENT_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error('HEDERA_CLIENT_PRIVATE_KEY missing from testbed/.env');

  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain: hederaTestnet, transport: http() });

  const chainId = await pub.getChainId();
  if (chainId !== 296) throw new Error(`refusing: RPC reports chainId ${chainId}, expected 296 (Hedera testnet)`);

  const balance = await pub.getBalance({ address: account.address });
  const owned = await pub.readContract({ address: REGISTRY, abi, functionName: 'balanceOf', args: [account.address] });

  console.log('Preflight — ERC-8004 registration on Hedera testnet\n');
  console.log(`  signer        ${account.address}  (${env.HEDERA_CLIENT_ACCOUNT_ID})`);
  console.log(`  chainId       ${chainId}`);
  console.log(`  balance       ${formatEther(balance)} HBAR`);
  console.log(`  registry      ${REGISTRY}`);
  console.log(`  agents owned  ${owned}\n`);

  // ── update path ─────────────────────────────────────────────────────────
  if (updateIdx >= 0) {
    const agentId = BigInt(args[updateIdx + 1]);
    const owner = await pub.readContract({ address: REGISTRY, abi, functionName: 'ownerOf', args: [agentId] });
    if (owner.toLowerCase() !== account.address.toLowerCase()) {
      throw new Error(`refusing: agent ${agentId} is owned by ${owner}, not the signer`);
    }
    const uri = toDataUri(registrationFile({ agentId, apiEndpoint }));
    console.log('  new registration file:');
    console.log(JSON.stringify(assertDecodable(uri), null, 2).replace(/^/gm, '    '));
    if (!send) return console.log('\nDRY RUN — nothing sent. Re-run with --send to call setAgentURI.');

    const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http() });
    const hash = await wallet.writeContract({ address: REGISTRY, abi, functionName: 'setAgentURI', args: [agentId, uri] });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    console.log(`\nsetAgentURI ${receipt.status}  tx ${hash}`);
    return;
  }

  // ── register path ───────────────────────────────────────────────────────
  if (owned > 0n && !args.includes('--allow-duplicate')) {
    throw new Error(
      `refusing: signer already owns ${owned} agent(s) on this registry. ` +
        `Use --update <agentId> instead, or --allow-duplicate if you really mean it.`,
    );
  }

  const uri = toDataUri(registrationFile({ apiEndpoint }));
  const decoded = assertDecodable(uri);
  console.log('  registration file (round-trips through base64 cleanly):');
  console.log(JSON.stringify(decoded, null, 2).replace(/^/gm, '    '));
  console.log(`\n  agentURI length ${uri.length} bytes`);

  if (!send) {
    console.log('\nDRY RUN — nothing sent. Minting is irreversible; re-run with --send to register.');
    return;
  }

  const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http() });
  const gas = await pub.estimateContractGas({
    address: REGISTRY, abi, functionName: 'register', args: [uri], account,
  });
  console.log(`\n  estimated gas ${gas}`);

  const hash = await wallet.writeContract({ address: REGISTRY, abi, functionName: 'register', args: [uri] });
  console.log(`  submitted     ${hash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`  status        ${receipt.status}  (block ${receipt.blockNumber})`);

  let agentId: bigint | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== REGISTRY.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (ev.eventName === 'Registered') agentId = (ev.args as { agentId: bigint }).agentId;
    } catch {
      /* not our event */
    }
  }
  if (agentId === undefined) throw new Error('registered, but no Registered event found in the receipt');

  console.log(`\n  ✓ Preflight is ERC-8004 agent #${agentId} on Hedera testnet`);
  console.log(`    ${hederaTestnet.blockExplorers!.default.url}/transaction/${hash}`);
  console.log(`\n  Next: fill in registrations[] now that the id is known:`);
  console.log(`    npx tsx scripts/register-agent.ts --update ${agentId} --send`);
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
