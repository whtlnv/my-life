import { Hono } from 'hono';

import type { HealthResponse } from '@my-life/contracts';

// The HTTP app, built without a port so tests call it directly through `app.request`.
export function createApp(): Hono {
  const app = new Hono();
  app.get('/health', (context) => context.json({ ok: true } satisfies HealthResponse));
  return app;
}
