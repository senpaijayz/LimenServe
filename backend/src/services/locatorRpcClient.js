import { request as httpsRequest } from 'node:https';
import { performance } from 'node:perf_hooks';
import { env } from '../config/env.js';

export const LOCATOR_RPC_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

// Isolate locator commands from the shared fetch connection pool. One fresh
// TLS connection per command; never automatically replay a potentially committed
// write. Credentials remain server-side and go only to the configured project.
export function createLocatorRpcClient({
  supabaseUrl, serviceRoleKey, request = httpsRequest,
  timeoutMs = LOCATOR_RPC_TIMEOUT_MS,
} = {}) {
  const endpoint = new URL('/rest/v1/rpc/limen_locator_command', supabaseUrl);
  if (endpoint.protocol !== 'https:') throw new Error('Locator RPC requires HTTPS.');
  if (!serviceRoleKey) throw new Error('Locator RPC server credentials are missing.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid locator timeout.');

  return {
    rpc(name, args, { signal } = {}) {
      if (name !== 'limen_locator_command') return Promise.reject(new Error('Unsupported locator RPC.'));
      const body = JSON.stringify(args);
      return new Promise((resolve) => {
        const started = performance.now();
        let settled = false;
        let upstream;
        let timer;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          resolve({ ...result, durationMs: performance.now() - started });
        };
        const cancel = (code) => {
          finish({ error: { code, message: 'Locator connection could not confirm the result.' } });
          upstream?.destroy();
        };
        const onAbort = () => cancel('LOCATOR_ABORTED');
        if (signal?.aborted) { onAbort(); return; }
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => cancel('LOCATOR_UPSTREAM_TIMEOUT'), timeoutMs);
        try {
          upstream = request(endpoint, {
            method: 'POST', agent: false,
            headers: {
              apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json', Accept: 'application/json',
              'Content-Profile': 'public', 'Content-Length': Buffer.byteLength(body),
              Connection: 'close',
            },
          }, (response) => {
            let size = 0;
            const chunks = [];
            response.on('data', (chunk) => {
              size += chunk.length;
              if (size > MAX_RESPONSE_BYTES) {
                cancel('LOCATOR_RESPONSE_TOO_LARGE'); response.destroy(); return;
              }
              chunks.push(chunk);
            });
            response.on('error', () => finish({ error: { code: 'LOCATOR_NETWORK_ERROR', message: 'Locator response interrupted.' } }));
            response.on('aborted', () => finish({ error: { code: 'LOCATOR_NETWORK_ERROR', message: 'Locator response interrupted.' } }));
            response.on('end', () => {
              try {
                const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (response.statusCode >= 200 && response.statusCode < 300) finish({ data });
                else finish({ error: { code: data?.code || 'LOCATOR_UPSTREAM_ERROR', message: data?.message || 'Locator service unavailable.' } });
              } catch {
                finish({ error: { code: 'LOCATOR_UPSTREAM_ERROR', message: 'Locator service returned an invalid response.' } });
              }
            });
          });
          upstream.on('error', () => finish({ error: { code: 'LOCATOR_NETWORK_ERROR', message: 'Locator connection failed.' } }));
          upstream.end(body);
        } catch {
          finish({ error: { code: 'LOCATOR_NETWORK_ERROR', message: 'Locator connection failed.' } });
        }
      });
    },
  };
}

export const locatorRpcClient = createLocatorRpcClient({
  supabaseUrl: env.supabaseUrl, serviceRoleKey: env.supabaseServiceRoleKey,
});
