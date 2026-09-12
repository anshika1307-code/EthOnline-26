/**
 * P1 — Liveness.
 *
 * Does a declared service endpoint actually answer? Run over several rounds so
 * the report can say "dead 3/3" rather than "dead once" — a single timeout is
 * weak evidence, three across an event is not.
 *
 * PASSIVE and safe against third parties (ETHICS.md §1 rule 1):
 *   - one request per endpoint per round
 *   - GET, no payment, no payload, nothing adversarial
 *   - identifies itself by User-Agent
 *   - backs off and stops on a refusal signal (429 / 403)
 */
import type { CheckResult } from '../types.js';

const USER_AGENT = 'Preflight/0.1 (+https://github.com/anshika1307-code/EthOnline-26) ERC-8004 endpoint checker';

export type P1Config = {
  /** Attempts within one round, used for a median latency. Keep small — this hits other people's servers. */
  attempts?: number;
  timeoutMs?: number;
  /** Pause between attempts, so we are never more than one request in flight. */
  spacingMs?: number;
};

export type Probe = {
  attempt: number;
  ok: boolean;
  status?: number;
  /** True for text/event-stream — the body is never drained, so latency is TTFB. */
  stream?: boolean;
  latencyMs: number;
  finalUrl?: string;
  redirected?: boolean;
  contentType?: string | null;
  error?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** A signal that the operator does not want our traffic. We stop, we do not retry. */
function isRefusal(status?: number): boolean {
  return status === 429 || status === 403;
}

export async function checkLiveness(endpoint: string, cfg: P1Config = {}): Promise<CheckResult> {
  const attempts = cfg.attempts ?? 3;
  const timeoutMs = cfg.timeoutMs ?? 10_000;
  const spacingMs = cfg.spacingMs ?? 400;
  const observedAt = new Date().toISOString();

  const probes: Probe[] = [];
  let refused = false;

  for (let i = 1; i <= attempts; i++) {
    if (i > 1) await sleep(spacingMs);
    const startedAt = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': USER_AGENT, accept: '*/*' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Latency is time-to-response-headers, measured BEFORE touching the body.
      // Several real agent endpoints are `text/event-stream` (MCP over SSE) and
      // never close: draining them measures our own timeout, not their speed.
      const latencyMs = Date.now() - startedAt;
      const contentType = res.headers.get('content-type');
      const isStream = (contentType ?? '').includes('text/event-stream');
      if (isStream) {
        // Hang up rather than hold an open stream on someone else's server.
        await res.body?.cancel().catch(() => undefined);
      } else {
        await res.arrayBuffer().catch(() => undefined);
      }
      probes.push({
        attempt: i,
        ok: res.ok,
        status: res.status,
        stream: isStream,
        latencyMs,
        finalUrl: res.url,
        redirected: res.redirected,
        contentType,
      });
      if (isRefusal(res.status)) {
        refused = true;
        break; // ETHICS.md rule 4 — if asked to stop, we stop.
      }
    } catch (err) {
      probes.push({
        attempt: i,
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const answered = probes.filter((p) => p.status !== undefined);
  const succeeded = probes.filter((p) => p.ok);
  const latencies = succeeded.map((p) => p.latencyMs);

  const evidence: Record<string, unknown> = {
    endpoint,
    attempts: probes.length,
    answeredCount: answered.length,
    okCount: succeeded.length,
    medianLatencyMs: median(latencies),
    statuses: probes.map((p) => p.status ?? p.error ?? 'no-response'),
    finalUrl: succeeded[0]?.finalUrl ?? answered[0]?.finalUrl,
    redirected: succeeded[0]?.redirected ?? answered[0]?.redirected,
    contentType: succeeded[0]?.contentType,
    isStream: succeeded.some((p) => p.stream) || undefined,
    probes,
  };

  if (refused) {
    return {
      id: 'P1',
      outcome: 'warn',
      summary: `endpoint signalled refusal (HTTP ${answered.at(-1)?.status}) — stopped probing`,
      evidence,
      observedAt,
    };
  }

  if (succeeded.length === 0 && answered.length === 0) {
    return {
      id: 'P1',
      outcome: 'fail',
      summary: `no response in ${probes.length}/${probes.length} attempts (${probes[0]?.error ?? 'unreachable'})`,
      evidence,
      observedAt,
    };
  }

  if (succeeded.length === 0) {
    return {
      id: 'P1',
      outcome: 'fail',
      summary: `answered but never successfully: HTTP ${answered.map((p) => p.status).join(', ')} across ${answered.length} attempts`,
      evidence,
      observedAt,
    };
  }

  if (succeeded.length < probes.length) {
    return {
      id: 'P1',
      outcome: 'warn',
      summary: `responded ${succeeded.length}/${probes.length}, median ${median(latencies)}ms — intermittent`,
      evidence,
      observedAt,
    };
  }

  const streamNote = succeeded.some((p) => p.stream) ? ' (SSE stream; latency is time-to-headers)' : '';
  return {
    id: 'P1',
    outcome: 'pass',
    summary: `responded ${succeeded.length}/${probes.length}, median ${median(latencies)}ms${streamNote}`,
    evidence,
    observedAt,
  };
}
