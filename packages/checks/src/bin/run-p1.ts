/**
 * Run P1 (liveness) over every http(s) service endpoint found in the latest
 * registry scan, and write a timestamped round to data/liveness-runs/.
 *
 * Passive only. Safe against third parties. See ETHICS.md.
 *
 *   npm run p1                 # newest scan in data/scan-runs/
 *   npm run p1 -- <file.json>  # a specific scan
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkLiveness } from '../checks/p1-liveness.js';
import type { CheckResult } from '../types.js';

const REPO = resolve(import.meta.dirname, '../../../..');
const SCAN_DIR = join(REPO, 'data', 'scan-runs');
const OUT_DIR = join(REPO, 'data', 'liveness-runs');

function newestScan(): string {
  const files = readdirSync(SCAN_DIR)
    .filter((f) => f.startsWith('sepolia-') && f.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new Error(`no scan files in ${SCAN_DIR}`);
  return join(SCAN_DIR, files[files.length - 1]);
}

const scanFile = process.argv[2] ? resolve(process.argv[2]) : newestScan();
const scan = JSON.parse(readFileSync(scanFile, 'utf8'));

type Target = { agentId: string; owner: string | null; url: string };
const targets: Target[] = scan.results.flatMap((r: any) =>
  (r.serviceEndpointUrls ?? []).map((url: string) => ({
    agentId: r.agentId,
    owner: r.owner,
    url,
  })),
);

console.log('P1 liveness  [passive — safe against third parties, see ETHICS.md]');
console.log(`  scan:      ${scanFile.replace(REPO + '/', '')}`);
console.log(`  sampled:   ${scan.agentsSampled} agents of ${scan.totalAgents} registered`);
console.log(`  endpoints: ${targets.length} across ${new Set(targets.map((t) => t.agentId)).size} agents\n`);

const results: Array<Target & { check: CheckResult }> = [];

for (const t of targets) {
  const check = await checkLiveness(t.url);
  results.push({ ...t, check });
  const mark = { pass: '✓', fail: '✗', warn: '⚠', skipped: '–' }[check.outcome];
  console.log(`${mark} agent ${t.agentId.padStart(4)}  ${t.url}`);
  console.log(`         ${check.summary}`);
  if (check.evidence.redirected) console.log(`         → redirected to ${check.evidence.finalUrl}`);
}

const pass = results.filter((r) => r.check.outcome === 'pass').length;
const warn = results.filter((r) => r.check.outcome === 'warn').length;
const fail = results.filter((r) => r.check.outcome === 'fail').length;

const agentsAlive = new Set(
  results.filter((r) => r.check.outcome === 'pass').map((r) => r.agentId),
).size;
const agentsTotal = new Set(targets.map((t) => t.agentId)).size;

console.log('\n===== P1 SUMMARY =====');
console.log(`Endpoints responding:   ${pass} / ${results.length}`);
console.log(`  intermittent:         ${warn}`);
console.log(`  dead:                 ${fail}`);
console.log(`Agents with a live endpoint: ${agentsAlive} / ${agentsTotal} that declared one`);
console.log(
  `\nAgainst the whole sample: ${agentsAlive} of ${scan.agentsSampled} agents sampled ` +
    `(${((agentsAlive / scan.agentsSampled) * 100).toFixed(2)}%) have an endpoint that answers.`,
);

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = join(OUT_DIR, `sepolia-p1-${stamp}.json`);
writeFileSync(
  outFile,
  JSON.stringify(
    {
      check: 'P1',
      ranAt: new Date().toISOString(),
      sourceScan: scanFile.replace(REPO + '/', ''),
      chain: scan.chain,
      agentsSampled: scan.agentsSampled,
      totalAgentsRegistered: scan.totalAgents,
      endpointsChecked: results.length,
      endpointsResponding: pass,
      endpointsIntermittent: warn,
      endpointsDead: fail,
      agentsWithLiveEndpoint: agentsAlive,
      agentsDeclaringEndpoint: agentsTotal,
      results,
    },
    null,
    2,
  ),
);
console.log(`\nRound written to ${outFile.replace(REPO + '/', '')}`);
