/**
 * The ethics boundary, enforced in code.
 *
 * ETHICS.md rule 2: Group A (active) checks run ONLY against our own deployed
 * testbed. Replay, free-shopping and gas-abuse probes against third-party
 * services are unauthorised testing. A comment is not a safeguard, so every
 * Group A check calls assertOwnTestbed() as its first line.
 */
import type { CheckId } from './types.js';

/**
 * Hosts we deployed ourselves. Only these may receive Group A checks.
 * Set OWN_TESTBED_HOSTS as a comma-separated list when the testbed is deployed.
 */
export function ownTestbedHosts(): Set<string> {
  const fromEnv = (process.env.OWN_TESTBED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  // localhost is ours by definition — the testbed runs here during development.
  return new Set(['localhost', '127.0.0.1', ...fromEnv]);
}

export class NotOurTestbedError extends Error {
  constructor(
    readonly host: string,
    readonly checkId: CheckId,
  ) {
    super(
      `Refusing to run active check ${checkId} against "${host}": not our testbed. ` +
        `Active checks against third parties are unauthorised testing (see ETHICS.md rule 2).`,
    );
    this.name = 'NotOurTestbedError';
  }
}

/**
 * Throws unless `url`'s host is one of ours.
 *
 * Exact host match only — no suffix matching, so an attacker-controlled
 * `localhost.evil.com` cannot slip through.
 */
export function assertOwnTestbed(url: string, checkId: CheckId): void {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new NotOurTestbedError(String(url), checkId);
  }
  if (!ownTestbedHosts().has(host)) {
    throw new NotOurTestbedError(host, checkId);
  }
}

/** True if `url` is ours, without throwing. Used to decide whether to skip Group A. */
export function isOwnTestbed(url: string): boolean {
  try {
    assertOwnTestbed(url, 'A1');
    return true;
  } catch {
    return false;
  }
}
