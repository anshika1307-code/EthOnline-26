/**
 * Which URLs a public Preflight surface may be asked to probe.
 *
 * Every front door (the free dashboard scan, the paid x402 API, the Bazantic
 * gateway) fetches a URL the caller chose. Without this, any of them is a way
 * to make our server reach loopback, the private network, or the cloud
 * metadata service.
 *
 * Hostname-based only. It does not resolve DNS, so a public name that resolves
 * to a private address (DNS rebinding) is not caught — see README limitations.
 */

const BLOCKED_NAMES = new Set(['localhost', 'metadata.google.internal', 'metadata']);

function isPrivateIPv4(h: string): boolean {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 || // all of loopback, not just .1
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, includes 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIPv6(h: string): boolean {
  // URL keeps IPv6 hosts in brackets.
  if (!h.startsWith('[')) return false;
  const ip = h.slice(1, -1);
  if (ip === '::' || ip === '::1') return true;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // WHATWG URL normalises ::ffff:a.b.c.d to hex groups.
  const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
    return isPrivateIPv4([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  return /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip); // unique-local, link-local
}

/** Why this URL must not be probed, or null if it may be. */
export function forbiddenTargetReason(url: URL): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'only http(s) is supported';
  if (url.username || url.password) return 'URLs with embedded credentials are not accepted';

  const h = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    BLOCKED_NAMES.has(h) ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    isPrivateIPv4(h) ||
    isPrivateIPv6(h)
  ) {
    return 'refusing to probe loopback, private or metadata addresses';
  }
  return null;
}
