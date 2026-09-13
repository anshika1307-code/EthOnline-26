import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forbiddenTargetReason } from './target-guard';

const reason = (u: string) => forbiddenTargetReason(new URL(u));

test('public endpoints are allowed', () => {
  for (const u of [
    'https://testbed-1l2m.onrender.com/good',
    'https://api.acme.dev/v1/check',
    'http://8.8.8.8/',
    'https://172.32.0.1/', // just outside 172.16/12
    'https://100.128.0.1/', // just outside CGNAT
  ]) {
    assert.equal(reason(u), null, u);
  }
});

test('loopback, private, link-local and metadata addresses are refused', () => {
  for (const u of [
    'http://localhost:3000/',
    'http://LOCALHOST./',
    'http://app.localhost/',
    'http://127.0.0.1/',
    'http://127.1.2.3/',
    'http://0.0.0.0/',
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.1.1/',
    'http://100.64.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/',
    'http://printer.local/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
  ]) {
    assert.notEqual(reason(u), null, u);
  }
});

test('decimal and hex IPv4 forms are normalised by URL and still refused', () => {
  // WHATWG URL parses these to 127.0.0.1 before we see them.
  assert.notEqual(reason('http://2130706433/'), null);
  assert.notEqual(reason('http://0x7f.0.0.1/'), null);
});

test('non-http schemes and embedded credentials are refused', () => {
  assert.notEqual(reason('file:///etc/passwd'), null);
  assert.notEqual(reason('ftp://acme.dev/'), null);
  assert.notEqual(reason('https://user:pass@acme.dev/'), null);
});
