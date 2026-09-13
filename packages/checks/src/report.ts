/**
 * The Preflight Report — plain English, evidence first.
 *
 * Deliberately NOT a score (brief v3 §3, §8): we report findings, not opinions.
 * A reader should be able to disagree with the verdict by reading the same
 * evidence lines we did.
 *
 * Lives in packages/checks rather than a separate packages/report as the brief
 * sketches — one fewer package to install on a 2-day clock. The rendering is
 * pure and has no dependencies, so splitting it out later is a file move.
 */
import { deriveVerdict, type CheckResult, type PreflightReport, type Verdict } from './types';

const MARK: Record<CheckResult['outcome'], string> = {
  pass: '✓',
  fail: '✗',
  warn: '⚠',
  skipped: '–',
};

/** One line per band, so the verdict never appears without its meaning. */
const VERDICT_LINE: Record<Verdict, string> = {
  SAFE: 'SAFE — checks passed',
  CAUTION: 'CAUTION — pricing or quote problems, read the evidence',
  UNSAFE: 'UNSAFE — do not pay',
  DEAD: 'DEAD — endpoint did not respond',
  UNKNOWN: 'UNKNOWN — not enough checks completed to judge',
};

/** Severity order so failures are read first, not buried under passes. */
const ORDER: Record<CheckResult['outcome'], number> = { fail: 0, warn: 1, pass: 2, skipped: 3 };

export type RenderOptions = {
  /**
   * Replace third-party hosts with an opaque id (ETHICS.md rule 7 — the
   * finding is the behaviour, not who did it). Always true for anything
   * published or shown in the demo.
   */
  anonymise?: boolean;
  /** Stable label to use when anonymising, e.g. "endpoint-7". */
  anonymousId?: string;
};

export function buildReport(
  target: { endpoint?: string; agentId?: string; chain: string },
  checks: CheckResult[],
): PreflightReport {
  return {
    target,
    verdict: deriveVerdict(checks),
    checks,
    activeChecksRun: checks.some((c) => c.id.startsWith('A') && c.outcome !== 'skipped'),
    generatedAt: new Date().toISOString(),
  };
}

function displayTarget(report: PreflightReport, opts: RenderOptions): string {
  const raw = report.target.endpoint ?? report.target.agentId ?? '(unknown target)';
  if (!opts.anonymise || !report.target.endpoint) return raw;
  const id = opts.anonymousId ?? 'endpoint';
  try {
    // Keep the path shape — it is often the informative part — drop the host.
    const u = new URL(report.target.endpoint);
    return `<${id}>${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return `<${id}>`;
  }
}

/** Renders the report block from brief v3 §3. */
export function renderReport(report: PreflightReport, opts: RenderOptions = {}): string {
  const lines: string[] = [];
  const label = report.target.agentId ? `agent ${report.target.agentId}` : 'ENDPOINT';

  lines.push(`ENDPOINT  ${displayTarget(report, opts)}`);
  if (report.target.agentId && report.target.endpoint) lines.push(`AGENT     ${report.target.agentId}`);
  lines.push(`CHAIN     ${report.target.chain}`);
  lines.push(`VERDICT   ${VERDICT_LINE[report.verdict]}`);
  lines.push('');

  const ran = [...report.checks]
    .filter((c) => c.outcome !== 'skipped')
    .sort((a, b) => ORDER[a.outcome] - ORDER[b.outcome] || a.id.localeCompare(b.id));

  for (const c of ran) {
    lines.push(`  ${MARK[c.outcome]} ${c.id}  ${c.summary}`);
  }
  if (ran.length === 0) lines.push('  (no checks completed)');

  // Say plainly which checks were withheld and why — the boundary is a feature.
  const skippedActive = report.checks.filter((c) => c.id.startsWith('A') && c.outcome === 'skipped');
  if (!report.activeChecksRun) {
    lines.push('');
    lines.push(
      skippedActive.length > 0
        ? `  Checks ${skippedActive.map((c) => c.id).join(', ')} not run: third-party endpoint, passive mode only.`
        : '  Active checks (A1–A4) not run: third-party endpoint, passive mode only.',
    );
  }

  const skippedPassive = report.checks.filter((c) => !c.id.startsWith('A') && c.outcome === 'skipped');
  for (const c of skippedPassive) {
    lines.push(`  – ${c.id}  not run: ${c.skippedReason ?? c.summary}`);
  }

  lines.push('');
  lines.push(`  Checked ${report.generatedAt}. Findings, not accusations — see METHODOLOGY.md.`);

  return lines.join('\n');
}

/** Compact one-liner for lists and tables. */
export function renderOneLine(report: PreflightReport, opts: RenderOptions = {}): string {
  const failed = report.checks.filter((c) => c.outcome === 'fail').map((c) => c.id);
  const suffix = failed.length ? `  failed: ${failed.join(', ')}` : '';
  return `${report.verdict.padEnd(8)} ${displayTarget(report, opts)}${suffix}`;
}
