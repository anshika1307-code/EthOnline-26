/**
 * Tests for the logic that decides the published headline number.
 *
 * `extractServiceEndpointUrls` is the single most consequential function in
 * this repo: it is the difference between reporting 184 agents with endpoints
 * and 85. These tests pin the definition so it cannot drift silently.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractServiceEndpointUrls,
  isUnreachableHost,
  isJunkPlaceholder,
  decodeDataUri,
  classify,
} from './fetch-agents';

describe('extractServiceEndpointUrls — what counts as a payable endpoint', () => {
  const urls = (services: unknown[]) => extractServiceEndpointUrls({ services }).urls;

  test('a `.example` host is rejected — RFC 2606 reserves the whole TLD', () => {
    // Caught a wrong test fixture, not a wrong implementation: `.example` is
    // reserved and can never resolve, so it must not count as an endpoint.
    assert.deepEqual(urls([{ name: 'MCP', endpoint: 'https://mesh.example/mcp' }]), []);
  });

  test('keeps a real MCP/A2A service endpoint', () => {
    assert.deepEqual(
      urls([{ name: 'MCP', endpoint: 'https://mesh.acme.dev/mcp/agent', version: '2025-06-18' }]),
      ['https://mesh.acme.dev/mcp/agent'],
    );
  });

  test('drops homepage, social and docs links — they are not services', () => {
    // 92 of 291 endpoints in the real registry were `web` homepages.
    assert.deepEqual(
      urls([
        { name: 'web', endpoint: 'https://myagent.acme.dev/' },
        { name: 'twitter', endpoint: 'https://x.com/myagent' },
        { name: 'github', endpoint: 'https://github.com/me/agent' },
        { name: 'docs', endpoint: 'https://docs.acme.dev/' },
      ]),
      [],
    );
  });

  test('drops localhost — 43 real endpoints pointed there', () => {
    assert.deepEqual(urls([{ name: 'MCP', endpoint: 'http://localhost:8080/mcp' }]), []);
    assert.deepEqual(urls([{ name: 'A2A', endpoint: 'http://127.0.0.1:3000/' }]), []);
  });

  test('drops RFC 2606 reserved domains', () => {
    assert.deepEqual(urls([{ name: 'MCP', endpoint: 'https://example.com/api' }]), []);
  });

  test('drops non-http endpoint kinds the spec allows', () => {
    assert.deepEqual(
      urls([
        { name: 'ENS', endpoint: 'vitalik.eth' },
        { name: 'DID', endpoint: 'did:method:foo' },
        { name: 'email', endpoint: 'mail@agent.acme.dev' },
        { name: 'agentWallet', endpoint: 'eip155:11155111:0xabc' },
        { name: 'OASF', endpoint: 'ipfs://Qm123' },
      ]),
      [],
    );
  });

  test('keeps the service entries in the raw output even when not counted', () => {
    // The raw claim stays inspectable so anyone can recount differently.
    const { services, urls: kept } = extractServiceEndpointUrls({
      services: [{ name: 'web', endpoint: 'https://home.acme.dev/' }],
    });
    assert.equal(services.length, 1);
    assert.equal(kept.length, 0);
  });

  test('survives malformed service entries without throwing', () => {
    assert.deepEqual(urls([null, 'a string', 42, {}, { endpoint: null }, { endpoint: 'not a url' }]), []);
    assert.deepEqual(extractServiceEndpointUrls({}).urls, []);
    assert.deepEqual(extractServiceEndpointUrls({ services: 'nope' }).urls, []);
  });

  test('a mixed registration keeps only the callable part', () => {
    // Modelled on a real agent: MCP + A2A + wallet + twitter.
    assert.deepEqual(
      urls([
        { name: 'A2A', endpoint: 'https://agent.acme.dev/.well-known/agent-card.json' },
        { name: 'MCP', endpoint: 'https://agent.acme.dev/mcp' },
        { name: 'agentWallet', endpoint: 'eip155:1:0xdead' },
        { name: 'twitter', endpoint: 'https://x.com/agent' },
      ]),
      ['https://agent.acme.dev/.well-known/agent-card.json', 'https://agent.acme.dev/mcp'],
    );
  });
});

describe('isUnreachableHost', () => {
  for (const h of [
    'localhost', '127.0.0.1', '0.0.0.0', '::1',
    '10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255',
    'box.local', 'example.com', 'foo.test', 'bar.invalid',
  ]) {
    test(`unreachable: ${h}`, () => assert.equal(isUnreachableHost(h), true));
  }
  for (const h of ['agent.example.org', 'mesh.heurist.xyz', '172.32.0.1', '11.0.0.1']) {
    test(`reachable: ${h}`, () => assert.equal(isUnreachableHost(h), false));
  }
});

describe('isJunkPlaceholder', () => {
  test('flags RFC 2606 http(s) URIs', () => {
    assert.equal(isJunkPlaceholder('https://example.com/agents/registration.json'), true);
    assert.equal(isJunkPlaceholder('http://foo.test/x'), true);
  });
  test('does not flag a real host', () => {
    assert.equal(isJunkPlaceholder('https://agent.real/registration.json'), false);
  });
  test('does not flag non-http URIs — those are a different category', () => {
    assert.equal(isJunkPlaceholder('ipfs://Qm123'), false);
    assert.equal(isJunkPlaceholder('data:application/json,{}'), false);
    assert.equal(isJunkPlaceholder(''), false);
  });
});

describe('decodeDataUri', () => {
  const b64 = (s: string) => Buffer.from(s).toString('base64');

  test('decodes a correct base64 data URI', () => {
    const d = decodeDataUri(`data:application/json;base64,${b64('{"name":"a"}')}`);
    assert.equal(d.name, 'a');
  });

  test('decodes a percent-encoded data URI', () => {
    const d = decodeDataUri('data:application/json,%7B%22name%22%3A%22b%22%7D');
    assert.equal(d.name, 'b');
  });

  test('falls back when ;base64 is declared but the payload is raw JSON', () => {
    // 86 of 87 sampled data: agents shipped this exact bug.
    const d = decodeDataUri('data:application/json;base64,{"name":"c"}');
    assert.equal(d.name, 'c');
  });

  test('throws on a genuinely undecodable payload', () => {
    assert.throws(() => decodeDataUri('data:application/json;base64,!!!not json!!!'));
    assert.throws(() => decodeDataUri('data:application/json'));
  });
});

describe('classify', () => {
  test('no agentURI is no-uri, never a failure', () => {
    assert.equal(classify('', false, [], []), 'no-uri');
  });
  test('resolved with an http endpoint', () => {
    assert.equal(classify('ipfs://x', true, [{}], ['https://a/']), 'confirmed-has-endpoint');
  });
  test('resolved with empty services', () => {
    assert.equal(classify('ipfs://x', true, [], []), 'confirmed-empty');
  });
  test('resolved with services but nothing addressable', () => {
    assert.equal(classify('ipfs://x', true, [{}], []), 'confirmed-no-endpoint');
  });
  test('unresolved on a reserved domain is junk, not a broken agent', () => {
    assert.equal(classify('https://example.com/a.json', false, [], []), 'junk-placeholder');
  });
  test('unresolved on a real host is unknown, not broken', () => {
    assert.equal(classify('ipfs://Qm123', false, [], []), 'unknown-gateway-failed');
  });
});
