import { locatorRpcClient } from './locatorRpcClient.js';

// Read-only startup verification of the exact transport used by real saves.
export async function probeLocatorConnection(logger, client = locatorRpcClient) {
  const { error, durationMs } = await client.rpc('limen_locator_command', {
    p_action: 'list', p_payload: { allowDraft: false }, p_actor: null,
  });
  const detail = { durationMs: Number(durationMs?.toFixed(1)), outcome: error?.code || 'ok' };
  if (error) logger.warn('locator.connection_probe', detail);
  else logger.info('locator.connection_probe', detail);
}
