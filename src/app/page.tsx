import { loadScan, loadLiveness, loadReports, funnel } from '@/lib/data';
import { ScanForm } from './ScanForm';

const VERDICT_STYLE: Record<string, string> = {
  SAFE: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
  CAUTION: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
  UNSAFE: 'bg-red-500/10 text-red-400 ring-red-500/30',
  DEAD: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30',
  UNKNOWN: 'bg-sky-500/10 text-sky-400 ring-sky-500/30',
};

const MARK: Record<string, string> = { pass: '✓', fail: '✗', warn: '⚠', skipped: '–' };
const MARK_STYLE: Record<string, string> = {
  pass: 'text-emerald-400',
  fail: 'text-red-400',
  warn: 'text-amber-400',
  skipped: 'text-zinc-600',
};

function Stat({ n, label, sub }: { n: string | number; label: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-[8rem] rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="font-mono text-3xl tabular-nums text-zinc-100">{n}</div>
      <div className="mt-1 text-sm text-zinc-300">{label}</div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export default function Home() {
  const scan = loadScan();
  const live = loadLiveness();
  const reports = loadReports();
  const f = funnel(scan, live, reports);

  const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(2)}%`);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Preflight</h1>
          <p className="mt-1 text-zinc-400">
            Before your AI agent pays a stranger&rsquo;s API, Preflight checks whether that endpoint is
            alive, honestly priced, and actually delivers.
          </p>
        </header>

        {!scan ? (
          <p className="rounded-lg border border-amber-800 bg-amber-950/40 p-4 text-amber-200">
            No scan data found in <code>data/scan-runs/</code>. Run <code>npm run fetch-agents</code>.
          </p>
        ) : (
          <>
            {/* The headline: what survives each step of the funnel. */}
            <section className="mb-10">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
                Of {f.sampled.toLocaleString()} agents sampled from {f.registered.toLocaleString()} registered
              </h2>
              <div className="flex flex-wrap gap-3">
                <Stat n={f.declared} label="declare an endpoint" sub={pct(f.declared, f.sampled)} />
                <Stat n={f.answering} label="answer when contacted" sub={pct(f.answering, f.sampled)} />
                <Stat n={f.paywalled} label="accept payment (valid x402 quote)" sub={pct(f.paywalled, f.sampled)} />
              </div>
              <p className="mt-3 text-sm text-zinc-500">
                Prior work measured <em>declaration</em>: 67 of the first 10,000 agents expose a service
                record (arXiv:2606.12128). The two columns to its right are behaviour, measured live.
              </p>
            </section>

            <ScanForm />

            {/* Registry composition — where the sampled agents actually land. */}
            <section className="mb-10">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
                Registry composition
              </h2>
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(scan.categoryCounts).map(([k, v]) => (
                      <tr key={k} className="border-b border-zinc-800/70 last:border-0">
                        <td className="px-4 py-2 font-mono text-zinc-400">{k}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-zinc-200">{v}</td>
                        <td className="w-1/2 px-4 py-2">
                          <div className="h-1.5 rounded bg-zinc-800">
                            <div
                              className="h-1.5 rounded bg-zinc-500"
                              style={{ width: `${(v / Math.max(scan.agentsSampled, 1)) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Per-endpoint reports. */}
            {reports ? (
              <section className="mb-10">
                <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-500">
                  Preflight reports
                </h2>
                <p className="mb-3 text-xs text-zinc-500">
                  {reports.anonymised
                    ? 'Third-party hosts are anonymised — the finding is the behaviour, not who did it.'
                    : 'Hosts shown (local mode).'}
                </p>
                <div className="space-y-3">
                  {reports.reports.map((r, i) => (
                    <details
                      key={i}
                      className="group rounded-lg border border-zinc-800 bg-zinc-900/40 open:bg-zinc-900/70"
                    >
                      <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 font-mono text-xs ring-1 ${
                            VERDICT_STYLE[r.verdict] ?? VERDICT_STYLE.UNKNOWN
                          }`}
                        >
                          {r.verdict}
                        </span>
                        <span className="font-mono text-xs text-zinc-500">
                          agent {r.target.agentId}
                        </span>
                        <span className="truncate font-mono text-xs text-zinc-400">
                          {/* display is anonymised at generation time; never render target.endpoint */}
                          {r.display ?? r.target.endpoint}
                        </span>
                      </summary>
                      <div className="border-t border-zinc-800 px-4 py-3">
                        <ul className="space-y-1">
                          {r.checks
                            .slice()
                            .sort((a, b) =>
                              (a.outcome === 'skipped' ? 1 : 0) - (b.outcome === 'skipped' ? 1 : 0),
                            )
                            .map((c) => (
                              <li key={c.id} className="flex gap-2 text-sm">
                                <span className={`font-mono ${MARK_STYLE[c.outcome]}`}>
                                  {MARK[c.outcome]} {c.id}
                                </span>
                                <span className="text-zinc-400">
                                  {c.outcome === 'skipped' && c.skippedReason
                                    ? `not run: ${c.skippedReason}`
                                    : c.summary}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}

            {/* The boundary is a feature, so it is on the page, not buried in a file. */}
            <section className="mb-10 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
                How this was measured
              </h2>
              <ul className="space-y-1 text-sm text-zinc-400">
                <li>
                  Third-party endpoints receive <strong className="text-zinc-300">passive checks only</strong> —
                  one request per round, identified by User-Agent, stopping on any refusal signal.
                </li>
                <li>
                  Adversarial checks (replay, idempotency) run <strong className="text-zinc-300">only against
                  endpoints we deployed ourselves</strong>, enforced in code, not by convention.
                </li>
                <li>
                  <strong className="text-zinc-300">SAFE requires a completed payment.</strong> An endpoint that
                  merely answers is <span className="font-mono text-sky-400">UNKNOWN</span>, not safe to pay.
                </li>
                <li>Findings, not accusations. Every number is reproducible from a file in <code>data/</code>.</li>
              </ul>
            </section>

            <footer className="border-t border-zinc-800 pt-4 text-xs text-zinc-600">
              <div className="font-mono">
                {scan.chain} · registry {scan.identityRegistry}
              </div>
              <div className="mt-1">
                scan {new Date(scan.scannedAt).toISOString()}
                {live ? ` · liveness ${new Date(live.ranAt).toISOString()}` : ''}
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
