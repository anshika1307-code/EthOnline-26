#!/usr/bin/env node
/**
 * Collapse the raw evidence in data/ into one small summary the dashboard can
 * import statically.
 *
 *   node scripts/build-dashboard-data.mjs   →  src/generated/dashboard.json
 *
 * Why this exists: a full registry scan is ~7 MB, and the dashboard was
 * parsing it on every request via readdirSync/readFileSync. That is slow
 * locally and does not survive a serverless deploy, where arbitrary files are
 * not guaranteed to be in the function bundle. Emitting a ~60 KB summary that
 * Next imports at build time removes the filesystem dependency entirely.
 *
 * The raw files stay in data/ as the evidence trail — this is a derived view,
 * regenerated whenever a scan is.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO, 'src', 'generated');

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

const declaring = scan.data.results.filter((r) => r.serviceEndpointUrls.length).length;
const payable = rep.data.reports.filter((r) =>
  r.checks.some((c) => c.id === 'P2' && c.outcome === 'pass'),
).length;

const summary = {
  generatedAt: new Date().toISOString(),
  sources: { scan: scan.name, liveness: live.name, reports: rep.name },

  chain: scan.data.chain,
  identityRegistry: scan.data.identityRegistry,
  scannedAt: scan.data.scannedAt,
  livenessRanAt: live.data.ranAt,

  funnel: {
    registered: scan.data.totalAgents,
    sampled: scan.data.agentsSampled,
    declared: declaring,
    answering: live.data.agentsWithLiveEndpoint,
    payable,
  },

  categoryCounts: scan.data.categoryCounts,
  concentration: rep.data.concentration ?? null,
  anonymised: rep.data.anonymised,

  // Reports, trimmed: the dashboard renders verdict + check lines only, never
  // the raw evidence blobs (which are most of the file size).
  reports: rep.data.reports.map((r) => ({
    agentId: r.target.agentId ?? null,
    display: r.display ?? r.target.endpoint ?? '',
    verdict: r.verdict,
    checks: r.checks.map((c) => ({
      id: c.id,
      outcome: c.outcome,
      summary: c.summary,
      skippedReason: c.skippedReason ?? null,
    })),
  })),
};

mkdirSync(OUT_DIR, { recursive: true });
const out = join(OUT_DIR, 'dashboard.json');
writeFileSync(out, JSON.stringify(summary, null, 2));

const kb = (Buffer.byteLength(JSON.stringify(summary)) / 1024).toFixed(0);
console.log(`wrote src/generated/dashboard.json  (${kb} KB, ${summary.reports.length} reports)`);
console.log(`  from ${scan.name}`);
console.log(`       ${live.name}`);
console.log(`       ${rep.name}`);
