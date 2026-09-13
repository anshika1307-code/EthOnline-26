/**
 * P5 — Discovery concentration.
 *
 * Not a property of one endpoint: a property of the shortlist an agent would
 * discover. If most of the registry resolves to one domain, then "choose an
 * agent from the registry" is really "use that one provider", and the payment
 * flow inherits whatever that provider does. Paper 1 (arXiv:2605.11781) found
 * 13,760 endpoints across 420 domains with the top domain at 77.5% and the top
 * nine at 87.8%, and treats discovery itself as an attack surface.
 *
 * Reported per endpoint as "this endpoint's domain accounts for X% of the
 * shortlist", so it appears in the same report as the other checks.
 *
 * Domains are ANONYMISED in output (ETHICS.md rule 7). Paper 1 anonymised them
 * too: the finding is the concentration, not who is concentrated.
 */
import type { CheckResult } from '../types';

/**
 * Warn above this share. Chosen so it flags "one provider effectively is the
 * registry" without firing on a merely-leading provider. Stated here rather
 * than buried so a reader can disagree with the number.
 */
export const CONCENTRATION_WARN_THRESHOLD = 0.5;

/**
 * Multi-part public suffixes we special-case. Without a full Public Suffix
 * List this is an approximation — `a.b.co.uk` groups correctly, an exotic
 * suffix may not. Hostname counts are reported alongside so a reader can see
 * the grouping we actually used.
 */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
  'co.jp', 'co.nz', 'co.in', 'com.br', 'github.io', 'pages.dev', 'vercel.app',
]);

export function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return lastThree;
  return lastTwo;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export type ConcentrationInput = {
  /** One entry per declared endpoint in the corpus. */
  endpoints: Array<{ agentId: string; url: string; owner?: string | null }>;
};

export type ConcentrationStats = {
  endpointCount: number;
  agentCount: number;
  domainCount: number;
  hostCount: number;
  /** domain -> endpoints, descending. Keys are real; anonymise at render time. */
  byDomain: Array<{ domain: string; endpoints: number; agents: number; share: number }>;
  topDomainShare: number;
  topThreeShare: number;
  /** Owner concentration — not in Paper 1, but the same question one layer down. */
  ownerCount: number;
  topOwnerShare: number;
  topTenOwnerShare: number;
};

export function computeConcentration(input: ConcentrationInput): ConcentrationStats {
  const { endpoints } = input;
  const domainAgents = new Map<string, Set<string>>();
  const domainCounts = new Map<string, number>();
  const hosts = new Set<string>();

  for (const e of endpoints) {
    const host = hostOf(e.url);
    if (!host) continue;
    hosts.add(host);
    const d = registrableDomain(host);
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    if (!domainAgents.has(d)) domainAgents.set(d, new Set());
    domainAgents.get(d)!.add(e.agentId);
  }

  const total = [...domainCounts.values()].reduce((a, b) => a + b, 0);
  const byDomain = [...domainCounts.entries()]
    .map(([domain, n]) => ({
      domain,
      endpoints: n,
      agents: domainAgents.get(domain)!.size,
      share: total === 0 ? 0 : n / total,
    }))
    .sort((a, b) => b.endpoints - a.endpoints);

  const owners = new Map<string, number>();
  for (const e of endpoints) {
    if (!e.owner) continue;
    owners.set(e.owner, (owners.get(e.owner) ?? 0) + 1);
  }
  const ownerTotal = [...owners.values()].reduce((a, b) => a + b, 0);
  const ownerRanked = [...owners.values()].sort((a, b) => b - a);
  const share = (n: number) => (ownerTotal === 0 ? 0 : n / ownerTotal);

  return {
    endpointCount: total,
    agentCount: new Set(endpoints.map((e) => e.agentId)).size,
    domainCount: byDomain.length,
    hostCount: hosts.size,
    byDomain,
    topDomainShare: byDomain[0]?.share ?? 0,
    topThreeShare: byDomain.slice(0, 3).reduce((a, d) => a + d.share, 0),
    ownerCount: owners.size,
    topOwnerShare: share(ownerRanked[0] ?? 0),
    topTenOwnerShare: share(ownerRanked.slice(0, 10).reduce((a, b) => a + b, 0)),
  };
}

/** Stable anonymous labels so runs stay comparable: domain-1, domain-2, … */
export function anonymiseDomains(stats: ConcentrationStats): Map<string, string> {
  const labels = new Map<string, string>();
  stats.byDomain.forEach((d, i) => labels.set(d.domain, `domain-${i + 1}`));
  return labels;
}

export function checkConcentration(
  endpointUrl: string,
  stats: ConcentrationStats,
  opts: { anonymise?: boolean; labels?: Map<string, string> } = {},
): CheckResult {
  const observedAt = new Date().toISOString();
  const host = hostOf(endpointUrl);
  const domain = host ? registrableDomain(host) : null;
  const entry = stats.byDomain.find((d) => d.domain === domain);

  const label =
    opts.anonymise === false
      ? (domain ?? 'unknown')
      : (opts.labels?.get(domain ?? '') ?? 'this domain');

  const evidence: Record<string, unknown> = {
    domain: opts.anonymise === false ? domain : label,
    endpointsOnDomain: entry?.endpoints ?? 0,
    agentsOnDomain: entry?.agents ?? 0,
    shareOfShortlist: entry?.share ?? 0,
    shortlistEndpoints: stats.endpointCount,
    shortlistDomains: stats.domainCount,
    topDomainShare: stats.topDomainShare,
    topThreeShare: stats.topThreeShare,
    threshold: CONCENTRATION_WARN_THRESHOLD,
    ownerCount: stats.ownerCount,
    topTenOwnerShare: stats.topTenOwnerShare,
  };

  if (!entry) {
    return {
      id: 'P5',
      outcome: 'skipped',
      summary: 'endpoint not present in the analysed shortlist',
      skippedReason: 'concentration is computed over a scan corpus this endpoint is not part of',
      evidence,
      observedAt,
    };
  }

  const pct = (entry.share * 100).toFixed(0);
  const summary =
    `${label} accounts for ${pct}% of the ${stats.endpointCount} declared endpoints ` +
    `in this shortlist (${stats.domainCount} domain${stats.domainCount === 1 ? '' : 's'} total)`;

  return {
    id: 'P5',
    outcome: entry.share > CONCENTRATION_WARN_THRESHOLD ? 'warn' : 'pass',
    summary,
    evidence,
    observedAt,
  };
}
