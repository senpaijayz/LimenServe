import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
process.env.APP_ENV = 'development';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
const { createLocatorRpcClient } = await import('./locatorRpcClient.js');

function fixture({ status = 200, text = '{"id":"saved"}', hang = false, failure = false, timeoutMs = 100 } = {}) {
  const calls = [];
  let socket;
  const client = createLocatorRpcClient({
    supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only-key', timeoutMs,
    request(url, options, callback) {
      calls.push({ url: url.href, options });
      socket = new EventEmitter();
      socket.destroyed = false;
      socket.destroy = () => { socket.destroyed = true; };
      socket.end = (body) => {
        calls[0].body = JSON.parse(body);
        if (hang) return;
        queueMicrotask(() => {
          if (failure) { socket.emit('error', new Error('private TLS details')); return; }
          const response = new EventEmitter();
          response.statusCode = status;
          callback(response);
          response.emit('data', Buffer.from(text));
          response.emit('end');
        });
      };
      return socket;
    },
  });
  return { client, calls, socket: () => socket };
}
const args = { p_action: 'save', p_payload: { objects: [] }, p_actor: 'actor' };

test('uses a fresh HTTPS connection and preserves the RPC contract', async () => {
  const f = fixture();
  const result = await f.client.rpc('limen_locator_command', args);
  assert.deepEqual(result.data, { id: 'saved' });
  assert.equal(f.calls[0].url, 'https://example.supabase.co/rest/v1/rpc/limen_locator_command');
  assert.equal(f.calls[0].options.agent, false);
  assert.equal(f.calls[0].options.headers.Connection, 'close');
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer server-only-key');
  assert.deepEqual(f.calls[0].body, args);
  assert.ok(Number.isFinite(result.durationMs));
});
test('stalled commands finish within the deadline and are never replayed', async () => {
  const f = fixture({ hang: true, timeoutMs: 15 });
  const result = await f.client.rpc('limen_locator_command', args);
  assert.equal(result.error.code, 'LOCATOR_UPSTREAM_TIMEOUT');
  assert.equal(f.socket().destroyed, true);
  assert.equal(f.calls.length, 1);
});
test('client cancellation releases the connection', async () => {
  const f = fixture({ hang: true });
  const controller = new AbortController();
  const pending = f.client.rpc('limen_locator_command', args, { signal: controller.signal });
  controller.abort();
  assert.equal((await pending).error.code, 'LOCATOR_ABORTED');
  assert.equal(f.socket().destroyed, true);
});
test('already cancelled requests do not open a connection', async () => {
  const f = fixture();
  const result = await f.client.rpc('limen_locator_command', args, { signal: AbortSignal.abort() });
  assert.equal(result.error.code, 'LOCATOR_ABORTED');
  assert.equal(f.calls.length, 0);
});
test('retains database revision conflicts and safely handles gateway failures', async () => {
  const conflict = fixture({ status: 409, text: '{"code":"40001","message":"Reload"}' });
  assert.equal((await conflict.client.rpc('limen_locator_command', args)).error.code, '40001');
  const invalid = fixture({ status: 504, text: 'upstream request timeout' });
  assert.equal((await invalid.client.rpc('limen_locator_command', args)).error.code, 'LOCATOR_UPSTREAM_ERROR');
  const network = fixture({ failure: true });
  assert.doesNotMatch(JSON.stringify(await network.client.rpc('limen_locator_command', args)), /private TLS/);
});
