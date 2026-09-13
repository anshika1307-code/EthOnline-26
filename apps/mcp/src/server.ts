/**
 * Preflight as an MCP server — front door #2 from brief v3 §3.
 *
 * So an agent (Claude, Cursor, anything speaking MCP) can ask, in plain
 * English, "is it safe to pay this endpoint?" *before* it pays, instead of
 * finding out afterwards.
 *
 *   preflight_check(endpoint | agentId)  → verdict + evidence
 *   ecosystem_stats()                    → the funnel across the whole registry
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ABUSE BOUNDARY
 *
 * An MCP tool that probes a caller-supplied URL is an attack proxy if you let
 * it be — worse than the HTTP API, because a model can be talked into calling
 * it. So this exposes **Group P (passive) only**: P1 liveness, P2 quote
 * validity, P3 price consistency. One request each, nothing adversarial.
 *
 * Group A (replay, idempotency, settlement timing, allowance scope) is not
 * reachable here and must never be added — no matter how the prompt is
 * phrased. Those run only against our own testbed, from our own CLI.
 * See ETHICS.md §1 rule 2.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { checkLiveness } from '../../../packages/checks/src/checks/p1-liveness';
import { checkQuote, checkPriceConsistency } from '../../../packages/checks/src/checks/p2-quote';
import { buildReport, renderReport } from '../../../packages/checks/src/report';
import type { CheckResult } from '../../../packages/checks/src/types';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function newestJson<T>(dir: string, prefix: string): T | null {
  const full = join(REPO, 'data', dir);
  if (!existsSync(full)) return null;
  const files = readdirSync(full).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
  if (!files.length) return null;
  return JSON.parse(readFileSync(join(full, files[files.length - 1]), 'utf8')) as T;
}

/** Resolve an ERC-8004 agentId to the endpoints it declares, from the latest scan. */
function endpointsForAgent(agentId: string): string[] {
  const scan = newestJson<any>('scan-runs', 'sepolia-');
  const row = scan?.results?.find((r: any) => String(r.agentId) === String(agentId));
  return row?.serviceEndpointUrls ?? [];
}

const server = new McpServer({ name: 'preflight', version: '0.1.0' });

server.registerTool(
  'preflight_check',
  {
    title: 'Preflight: is it safe to pay this endpoint?',
    description:
      'Check whether a service endpoint is alive, quotes a well-formed x402 payment, ' +
      'and prices honestly — before paying it. Accepts a URL or an ERC-8004 agentId. ' +
      'Runs passive checks only: it never attempts payment and never runs adversarial ' +
      'checks against third parties. Returns a verdict (SAFE / CAUTION / UNSAFE / DEAD / ' +
      'UNKNOWN) with the evidence behind it.',
    inputSchema: {
      endpoint: z.string().optional().describe('Endpoint URL to check, e.g. https://agent.example/api'),
      agentId: z.string().optional().describe('ERC-8004 agent id; its declared endpoints are looked up'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ endpoint, agentId }) => {
    const targets = endpoint ? [endpoint] : agentId ? endpointsForAgent(agentId) : [];

    if (!targets.length) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: agentId
              ? `Agent ${agentId} declares no addressable http(s) endpoint in the latest scan, so there is nothing to check. That is itself a finding: it cannot be paid.`
              : 'Provide either `endpoint` (a URL) or `agentId`.',
          },
        ],
      };
    }

    const blocks: string[] = [];
    for (const target of targets.slice(0, 5)) {
      let url: URL;
      try {
        url = new URL(target);
      } catch {
        blocks.push(`${target}\n  not a valid URL — skipped`);
        continue;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        blocks.push(`${target}\n  only http(s) endpoints can be checked — skipped`);
        continue;
      }

      const checks: CheckResult[] = [];
      checks.push(await checkLiveness(target));
      const { check: p2, quote } = await checkQuote(target);
      checks.push(p2);
      checks.push(checkPriceConsistency(quote, null));

      const report = buildReport(
        { endpoint: target, agentId, chain: 'ethereum-sepolia' },
        checks,
      );
      blocks.push(renderReport(report, { anonymise: false }));
    }

    return {
      content: [
        {
          type: 'text' as const,
          text:
            blocks.join('\n\n' + '─'.repeat(60) + '\n\n') +
            '\n\nPassive checks only. SAFE is never returned for a third party, because ' +
            'that would require completing a real payment — see ETHICS.md.',
        },
      ],
    };
  },
);

server.registerTool(
  'ecosystem_stats',
  {
    title: 'Preflight: how real is the agent economy?',
    description:
      'Summary of the most recent full scan of the ERC-8004 Identity Registry: how many ' +
      'agents are registered, how many declare an addressable service endpoint, how many ' +
      'answer when contacted, and how many actually accept payment.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const scan = newestJson<any>('scan-runs', 'sepolia-');
    const live = newestJson<any>('liveness-runs', 'sepolia-p1-');
    const rep = newestJson<any>('reports', 'sepolia-reports-');
    if (!scan) {
      return { isError: true, content: [{ type: 'text' as const, text: 'No scan data available.' }] };
    }

    const declaring = scan.results.filter((r: any) => r.serviceEndpointUrls.length).length;
    const payable =
      rep?.reports.filter((r: any) =>
        r.checks.some((c: any) => c.id === 'P2' && c.outcome === 'pass'),
      ).length ?? 0;
    const malformed =
      rep?.reports.filter((r: any) =>
        r.checks.some((c: any) => c.id === 'P2' && c.outcome === 'fail'),
      ).length ?? 0;
    const alive = live?.agentsWithLiveEndpoint ?? 0;
    const pct = (n: number) => ((n / scan.agentsSampled) * 100).toFixed(2);

    return {
      content: [
        {
          type: 'text' as const,
          text: [
            `ERC-8004 Identity Registry — ${scan.chain}, scanned ${scan.scannedAt}`,
            ``,
            `  registered                       ${scan.totalAgents}`,
            `  declare an addressable endpoint  ${declaring}  (${pct(declaring)}%)`,
            `  answer when contacted            ${alive}  (${pct(alive)}%)`,
            `  offer a well-formed x402 quote   ${payable}  (${pct(payable)}%)`,
            `  offer a malformed 402            ${malformed}`,
            ``,
            `Every figure is reproducible from data/ — run scripts/verify-claims.mjs.`,
          ].join('\n'),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
