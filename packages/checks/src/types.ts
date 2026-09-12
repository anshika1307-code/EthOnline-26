/** Shared types for the Preflight check suite. See METHODOLOGY.md. */

export type CheckId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'A1' | 'A2' | 'A3' | 'A4';

export type Outcome = 'pass' | 'fail' | 'warn' | 'skipped';

export type CheckResult = {
  id: CheckId;
  outcome: Outcome;
  /** One plain-English line for the report. Facts, never accusations (ETHICS.md §6). */
  summary: string;
  /** Raw observation kept so the result can be replayed and challenged. */
  evidence: Record<string, unknown>;
  observedAt: string;
  skippedReason?: string;
};

export type Verdict = 'SAFE' | 'CAUTION' | 'UNSAFE' | 'DEAD' | 'UNKNOWN';

export type PreflightReport = {
  target: { endpoint?: string; agentId?: string; chain: string };
  verdict: Verdict;
  checks: CheckResult[];
  /** True only when the target is our own testbed, so Group A was allowed to run. */
  activeChecksRun: boolean;
  generatedAt: string;
};

/**
 * Verdict derivation. Deterministic and hand-recomputable from the checks —
 * there is deliberately no score and no weighting (brief v3 §3, §8).
 */
export function deriveVerdict(checks: CheckResult[]): Verdict {
  const by = (id: CheckId) => checks.find((c) => c.id === id);
  const ran = checks.filter((c) => c.outcome !== 'skipped');
  if (ran.length === 0) return 'UNKNOWN';

  if (by('P1')?.outcome === 'fail') return 'DEAD';

  const activeFailed = checks.some((c) => c.id.startsWith('A') && c.outcome === 'fail');
  if (by('P4')?.outcome === 'fail' || activeFailed) return 'UNSAFE';

  if (by('P2')?.outcome === 'fail' || by('P3')?.outcome === 'fail') return 'CAUTION';

  const allGood = ran.every((c) => c.outcome === 'pass' || c.outcome === 'warn');

  // SAFE is a claim about paying, so it requires the delivery check to have
  // actually run and passed. An endpoint that merely answers a GET is alive,
  // not proven safe to pay — reporting that as SAFE would overclaim, which
  // ETHICS.md §6 forbids. Alive-but-unpaid-for is UNKNOWN.
  if (allGood) return by('P4')?.outcome === 'pass' ? 'SAFE' : 'UNKNOWN';

  return 'UNKNOWN';
}
