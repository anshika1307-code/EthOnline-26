'use client';

import { useState } from 'react';

type Check = { id: string; outcome: string; summary: string; skippedReason?: string };
type Report = { verdict: string; checks: Check[]; note?: string; error?: string };

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

export function ScanForm() {
  const [endpoint, setEndpoint] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `request failed (${res.status})`);
      else setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Check an endpoint
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Passive checks only — one liveness probe and one unpaid quote request. Nothing adversarial,
        and no payment is attempted.
      </p>

      <form onSubmit={scan} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          required
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://agent.example/api"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Run Preflight'}
        </button>
      </form>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {report ? (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center gap-3">
            <span
              className={`rounded px-2 py-0.5 font-mono text-xs ring-1 ${
                VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE.UNKNOWN
              }`}
            >
              {report.verdict}
            </span>
            <span className="truncate font-mono text-xs text-zinc-500">{endpoint}</span>
          </div>
          <ul className="space-y-1">
            {report.checks
              .slice()
              .sort((a, b) => (a.outcome === 'skipped' ? 1 : 0) - (b.outcome === 'skipped' ? 1 : 0))
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
          {report.note ? <p className="mt-3 text-xs text-zinc-600">{report.note}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
