/**
 * The guard is the safety rail for ETHICS.md rule 2. If these tests fail,
 * Group A checks could fire at third parties — stop and fix before scanning.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertOwnTestbed, isOwnTestbed, NotOurTestbedError } from './guard.js';

describe('assertOwnTestbed', () => {
  test('allows localhost (the testbed during development)', () => {
    assert.doesNotThrow(() => assertOwnTestbed('http://localhost:8402/bad-replay', 'A1'));
    assert.doesNotThrow(() => assertOwnTestbed('http://127.0.0.1:8402/good', 'A1'));
  });

  test('allows a host listed in OWN_TESTBED_HOSTS', () => {
    process.env.OWN_TESTBED_HOSTS = 'testbed.preflight.example';
    assert.doesNotThrow(() =>
      assertOwnTestbed('https://testbed.preflight.example/good', 'A1'),
    );
    delete process.env.OWN_TESTBED_HOSTS;
  });

  test('THROWS for a third-party host', () => {
    assert.throws(
      () => assertOwnTestbed('https://someone-elses-agent.xyz/api', 'A1'),
      NotOurTestbedError,
    );
  });

  test('THROWS for a suffix that merely looks like ours', () => {
    // localhost.evil.com must not pass as localhost
    assert.throws(() => assertOwnTestbed('https://localhost.evil.com/x', 'A2'), NotOurTestbedError);
    process.env.OWN_TESTBED_HOSTS = 'testbed.preflight.example';
    assert.throws(
      () => assertOwnTestbed('https://testbed.preflight.example.evil.com/x', 'A2'),
      NotOurTestbedError,
    );
    delete process.env.OWN_TESTBED_HOSTS;
  });

  test('THROWS on a malformed URL rather than failing open', () => {
    assert.throws(() => assertOwnTestbed('not a url', 'A3'), NotOurTestbedError);
    assert.throws(() => assertOwnTestbed('', 'A3'), NotOurTestbedError);
  });

  test('error names the check and explains why', () => {
    try {
      assertOwnTestbed('https://third-party.example/api', 'A1');
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err instanceof NotOurTestbedError);
      assert.match(err.message, /A1/);
      assert.match(err.message, /ETHICS\.md/);
    }
  });
});

describe('isOwnTestbed', () => {
  test('reports without throwing', () => {
    assert.equal(isOwnTestbed('http://localhost:8402/good'), true);
    assert.equal(isOwnTestbed('https://someone-elses-agent.xyz/api'), false);
    assert.equal(isOwnTestbed('garbage'), false);
  });
});
