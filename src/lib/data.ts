/**
 * Dashboard data.
 *
 * Imported statically from a generated summary rather than read off disk at
 * request time. The raw evidence in `data/` is ~18 MB (a full registry scan is
 * 7 MB on its own) — parsing that per request is slow locally and does not
 * survive a serverless deploy, where arbitrary files are not guaranteed to be
 * in the function bundle.
 *
 * Regenerate after any scan:
 *
 *   node scripts/build-dashboard-data.mjs
 *
 * `npm run build` does this automatically via the prebuild hook.
 */
import summary from '@/generated/dashboard.json';

export type Check = {
  id: string;
  outcome: string;
  summary: string;
  skippedReason: string | null;
};

export type Report = {
  agentId: string | null;
  /** Anonymised at generation time. Safe to render. */
  display: string;
  verdict: string;
  checks: Check[];
};

export type Dashboard = {
  generatedAt: string;
  sources: { scan: string; liveness: string; reports: string };
  chain: string;
  identityRegistry: string;
  scannedAt: string;
  livenessRanAt: string;
  funnel: {
    registered: number;
    sampled: number;
    declared: number;
    answering: number;
    payable: number;
  };
  categoryCounts: Record<string, number>;
  concentration: {
    endpointCount: number;
    domainCount: number;
    topDomainShare: number;
    ownerCount: number;
    topTenOwnerShare: number;
  } | null;
  anonymised: boolean;
  reports: Report[];
};

export function loadDashboard(): Dashboard {
  return summary as unknown as Dashboard;
}
