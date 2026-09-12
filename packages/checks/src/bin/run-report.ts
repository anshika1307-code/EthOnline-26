/**
 * Render Preflight Reports from the checks that have already run.
 *
 * Reads the newest registry scan + P1 liveness round and emits one report per
 * declared endpoint. Third parties are anonymised by default (ETHICS.md rule
 * 7) — pass --show-hosts for local debugging only, never for the demo.
 *
 *   npm run report
 *   npm run report -- --show-hosts
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildReport, renderReport, renderOneLine } from '../report.js';
import type { CheckResult } from '../types.js';

const REPO = resolve(import.meta.dirname, '../../../..');
const showHosts = process.argv.includes('--show-hosts');

function newest(dir: string, prefix: string): string {
  const files = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`no ${prefix}*.json in ${dir}`);
  return join(dir, files[files.length - 1]);
}

const scanFile = newest(join(REPO, 'data', 'scan-runs'), 'sepolia-');
const p1File = newest(join(REPO, 'data', 'liveness-runs'), 'sepolia-p1-');
const scan = JSON.parse(readFileSync(scanFile, 'utf8'));
const p1 = JSON.parse(readFileSync(p1File, 'utf8'));

console.log('Preflight reports');
console.log(`  scan:     ${scanFile.replace(REPO + '/', '')}`);
console.log(`  liveness: ${p1File.replace(REPO + '/', '')}`);
console.log(`  hosts:    ${showHosts ? 'SHOWN (local only)' : 'anonymised'}\n`);

type Row = { agentId: string; url: string; check: CheckResult };
const rows: Row[] = p1.results;

// Stable anonymous ids, assigned by first appearance so runs are comparable.
const ids = new Map<string, string>();
const anonId = (url: string) => {
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  if (!ids.has(host)) ids.set(host, `endpoint-${ids.size + 1}`);
  return ids.get(host)!;
};

const reports = rows.map((row) => {
  const checks: CheckResult[] = [row.check];

  // P4/A1 are not run against third parties: P4 spends money and needs a 402
  // quote we have not solicited; A1 is Group A and fenced entirely.
  checks.push({
    id: 'P4',
    outcome: 'skipped',
    summary: 'not attempted',
    skippedReason: 'no payment attempted against a third-party endpoint in this round',
    evidence: {},
    observedAt: p1.ranAt,
  });
  checks.push({
    id: 'A1',
    outcome: 'skipped',
    summary: 'not attempted',
    skippedReason: 'third-party endpoint',
    evidence: {},
    observedAt: p1.ranAt,
  });

  const report = buildReport(
    { endpoint: row.url, agentId: row.agentId, chain: scan.chain },
    checks,
  );
  return { row, report, opts: { anonymise: !showHosts, anonymousId: anonId(row.url) } };
});

for (const { report, opts } of reports) {
  console.log(renderReport(report, opts));
  console.log('─'.repeat(72));
}

console.log('\nSUMMARY');
for (const { report, opts } of reports) console.log('  ' + renderOneLine(report, opts));

const counts = reports.reduce<Record<string, number>>((acc, { report }) => {
  acc[report.verdict] = (acc[report.verdict] ?? 0) + 1;
  return acc;
}, {});
console.log('\n  ' + Object.entries(counts).map(([v, n]) => `${v}: ${n}`).join('   '));

const outDir = join(REPO, 'data', 'reports');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = join(outDir, `sepolia-reports-${stamp}.json`);
writeFileSync(
  outFile,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceScan: scanFile.replace(REPO + '/', ''),
      sourceLiveness: p1File.replace(REPO + '/', ''),
      anonymised: !showHosts,
      verdictCounts: counts,
      reports: reports.map(({ report, opts }) => ({
        ...report,
        rendered: renderReport(report, opts),
      })),
    },
    null,
    2,
  ),
);
console.log(`\nWritten to ${outFile.replace(REPO + '/', '')}`);
