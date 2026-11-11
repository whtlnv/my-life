// Drives the demo composition (demo.ts, as scripts/demo.sh runs it) as a process, so what the screenshots are taken
// against is pinned from the outside.

import { type ChildProcess, spawn } from 'node:child_process';
import { type AddressInfo, createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) =>
    probe.close(() => {
      resolve();
    }),
  );
  return port;
}

async function waitUntilHealthy(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const healthy = await fetch(`${baseUrl}/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (healthy) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('the demo backend never answered /health');
}

describe('the demo backend (demo.ts)', () => {
  let demo: ChildProcess | undefined;

  afterEach(() => {
    demo?.kill();
  });

  async function startDemo(): Promise<string> {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${String(port)}`;
    demo = spawn('node_modules/.bin/tsx', ['src/demo.ts'], {
      cwd: backendDirectory,
      env: { ...process.env, MY_LIFE_DEMO_PORT: String(port) },
      stdio: 'ignore',
    });
    await waitUntilHealthy(baseUrl);
    return baseUrl;
  }

  it('lists at GET /triage-queue a Telegram bot digest from its scripted Telegram session', async () => {
    const baseUrl = await startDemo();

    const { digests } = (await (await fetch(`${baseUrl}/triage-queue`)).json()) as { digests: unknown[] };

    expect(digests).toContainEqual(expect.objectContaining({ channel: 'telegram' }));
  }, 30_000);
});
