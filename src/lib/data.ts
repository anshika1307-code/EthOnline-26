/**
 * Loads the newest scan / liveness / report rounds from `data/`.
 *
 * Deliberately reads the same JSON files the CLI writes, rather than a
 * database: every number on the site is traceable to a committed file, which
 * is what makes the findings checkable (METHODOLOGY.md).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.cwd(), 'data');

function newest<T>(dir: string, prefix: string): T | null {
  const full = join(DATA, dir);
  if (!existsSync(full)) return null;
  const files = readdirSync(full)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort();
  if (files.length === 0) return null;
  return JSON.parse(readFileSync(join(full, files[files.length - 1]), 'utf8')) as T;
}

export type Scan = {
  scannedAt: string;
  chain: string;
  identityRegistry: string;
  totalAgents: number;
  agentsSampled: number;
  categoryCounts: Record<string, number>;
  confirmedTotal: number;
  noEndpointConfirmed: number;
  results: Array<{
    agentId: string;
    owner: string | null;
    category: string;
    serviceEndpointUrls: string[];
  }>;
};

export type Liveness = {
  ranAt: string;
  agentsSampled: number;
  totalAgentsRegistered: number;
  endpointsChecked: number;
  endpointsResponding: number;
  endpointsDead: number;
  agentsWithLiveEndpoint: number;
  agentsDeclaringEndpoint: number;
};

export type Reports = {
  generatedAt: string;
  anonymised: boolean;
  verdictCounts: Record<string, number>;
  concentration?: {
    endpointCount: number;
    domainCount: number;
    topDomainShare: number;
    ownerCount: number;
    topTenOwnerShare: number;
  };
  reports: Array<{
    target: { endpoint?: string; agentId?: string; chain: string };
    verdict: string;
    /** Anonymised unless the round was generated with --show-hosts. Render this, not target.endpoint. */
    display?: string;
    checks: Array<{ id: string; outcome: string; summary: string; skippedReason?: string }>;
    rendered: string;
  }>;
};

export function loadScan() {
  return newest<Scan>('scan-runs', 'sepolia-');
}
export function loadLiveness() {
  return newest<Liveness>('liveness-runs', 'sepolia-p1-');
}
export function loadReports() {
  return newest<Reports>('reports', 'sepolia-reports-');
}

/** The funnel that is the headline: registered → declared → answers → accepts payment. */
export function funnel(scan: Scan | null, live: Liveness | null, reports: Reports | null) {
  const declared = scan?.categoryCounts?.['confirmed-has-endpoint'] ?? 0;
  const answering = live?.agentsWithLiveEndpoint ?? 0;
  // An agent "accepts payment" only if some endpoint produced a valid x402 quote (P2 pass).
  const paywalled =
    reports?.reports.filter((r) => r.checks.some((c) => c.id === 'P2' && c.outcome === 'pass'))
      .length ?? 0;
  return {
    registered: scan?.totalAgents ?? 0,
    sampled: scan?.agentsSampled ?? 0,
    declared,
    answering,
    paywalled,
  };
}
