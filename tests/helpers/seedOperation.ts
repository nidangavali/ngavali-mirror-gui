import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Seeds a single operation via the API: starts it, stops it immediately,
 * and polls until it reaches a terminal status (success|failed|stopped).
 * Returns the operation ID for cleanup.
 */
export async function seedOperation(
  request: APIRequestContext,
  configName: string,
): Promise<string> {
  const startRes = await request.post('/api/operations/start', {
    data: { configFile: configName },
  });
  expect(startRes.ok(), `Start failed: ${await startRes.text()}`).toBeTruthy();
  const { operationId } = await startRes.json();

  await request.post(`/api/operations/${operationId}/stop`);

  await expect(async () => {
    const res = await request.get('/api/operations');
    const ops = await res.json();
    const op = ops.find((o: { id: string }) => o.id === operationId);
    expect(op?.status).toMatch(/^(success|failed|stopped)$/);
  }).toPass({ timeout: 15000 });

  return operationId;
}
