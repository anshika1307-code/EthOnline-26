#!/usr/bin/env node
/**
 * Re-derive every headline number in the README straight from the raw data,
 * and fail loudly if any of them disagrees.
 *
 *   node scripts/verify-claims.mjs
 *
 * This deliberately shares no code with the scanner or the report renderer.
 * It re-counts from the stored per-probe evidence, so if a bug in the pipeline
 * inflated a figure, the two paths diverge and this exits non-zero.
 *
 * Zero dependencies — a reviewer can clone the repo and run it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

function newest(dir, prefix) {
  const d = join(REPO, 'data', dir);
  const files = readdirSync(d).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
  if (!files.length) throw new Error(`no ${prefix}*.json in data/${dir}`);
  const name = files[files.length - 1];
  return { name, data: JSON.parse(readFileSync(join(d, name), 'utf8')) };
}

const scan = newest('scan-runs', 'sepolia-');
const live = newest('liveness-runs', 'sepolia-p1-');
const rep = newest('reports', 'sepolia-reports-');

console.log('Verifying README.md + docs/findings.md claims against raw data\n');
console.log(`  scan     ${scan.name}`);
console.log(`  liveness ${live.name}`);
console.log(`  reports  ${rep.name}\n`);

const total = scan.data.totalAgents;
const sampled = scan.data.agentsSampled;
const declaring = new Set(
  scan.data.results.filter((r) => r.serviceEndpointUrls.length).map((r) => r.agentId),
);
const endpoints = scan.data.results.reduce((n, r) => n + r.serviceEndpointUrls.length, 0);

// Liveness recounted from individual probes, not the stored summary.
const aliveAgents = new Set();
let aliveEndpoints = 0;
for (const row of live.data.results) {
  const probes = row.check.evidence.probes ?? [];
  if (probes.some((p) => p.ok)) {
    aliveEndpoints++;
    aliveAgents.add(row.agentId);
  }
}

const hasP2 = (r, outcome) => r.checks.some((c) => c.id === 'P2' && c.outcome === outcome);
const wellFormed = rep.data.reports.filter((r) => hasP2(r, 'pass'));
const malformed = rep.data.reports.filter((r) => hasP2(r, 'fail'));
const paywalled = new Set([...wellFormed, ...malformed].map((r) => r.target.agentId));

// ---- extra series used by docs/findings.md -------------------------------
const owners = new Map();
for (const r of scan.data.results) {
  if (!r.owner) continue;
  owners.set(r.owner, (owners.get(r.owner) ?? 0) + 1);
}
const ownedTotal = [...owners.values()].reduce((a, b) => a + b, 0);
const ranked = [...owners.values()].sort((a, b) => b - a);
const top10 = ranked.slice(0, 10).reduce((a, b) => a + b, 0);

let ipfsSkipped = 0;
for (const r of scan.data.results) {
  if (r.category === 'unknown-gateway-failed' && (r.metadataError ?? '').includes('circuit open')) {
    ipfsSkipped++;
  }
}
const ipfsAttempted = scan.data.categoryCounts['unknown-gateway-failed'] - ipfsSkipped;

/** Claims as written in README.md and docs/findings.md. Update together, never one alone. */
const CLAIMS = [
  ['agents registered', total, 10249],
  ['every agent scanned (sampled === registered)', sampled, 10249],
  ['agents declaring an addressable endpoint', declaring.size, 85],
  ['endpoints declared', endpoints, 149],
  ['agents with an endpoint that answers', aliveAgents.size, 37],
  ['endpoints responding', aliveEndpoints, 67],
  ['agents paywalled with x402', paywalled.size, 5],
  ['well-formed payment quotes', wellFormed.length, 5],
  ['malformed payment quotes', malformed.length, 0],

  // docs/findings.md
  ['distinct owners', owners.size, 1489],
  ['agents with a known owner', ownedTotal, 10025],
  ['top owner agent count', ranked[0], 5846],
  ['top ten owners combined', top10, 7065],
  ['IPFS attempted and failed', ipfsAttempted, 795],
  ['IPFS never attempted (circuit open)', ipfsSkipped, 746],
  ['confirmed-empty', scan.data.categoryCounts['confirmed-empty'], 7707],
  ['junk-placeholder', scan.data.categoryCounts['junk-placeholder'], 407],
  ['no-uri', scan.data.categoryCounts['no-uri'], 374],
  ['confirmed-no-endpoint', scan.data.categoryCounts['confirmed-no-endpoint'], 135],
];

let failed = 0;
for (const [label, got, claimed] of CLAIMS) {
  const ok = got === claimed;
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label.padEnd(48)} data=${String(got).padEnd(6)} README=${claimed}`);
}

const pct = (n) => ((n / sampled) * 100).toFixed(2);
console.log(`\n  declare an endpoint : ${pct(declaring.size)}%   (README 0.83%)`);
console.log(`  answer when contacted: ${pct(aliveAgents.size)}%   (README 0.36%)`);
console.log(`  well-formed quote   : ${((wellFormed.length / sampled) * 100).toFixed(3)}%  (README 0.05%)`);

if (failed) {
  console.error(`\nFAILED: ${failed} claim(s) disagree with the data. Fix the docs, not this script.`);
  process.exit(1);
}
console.log('\nAll claims verified against the raw data.');
