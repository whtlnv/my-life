import { Hono } from 'hono';

import type { HealthResponse } from '@my-life/contracts';

export interface AppOptions {
  allowedEmails: string[];
}

// The HTTP app, built without a port so tests call it directly through `app.request`.
export function createApp(options: AppOptions = { allowedEmails: [] }): Hono {
  const app = new Hono();
  app.get('/health', (context) => context.json({ ok: true } satisfies HealthResponse));
  app.post('/register', async (context) => {
    const { email } = await context.req.json<{ email: string }>();
    if (!options.allowedEmails.includes(email)) {
      return context.body(null, 403);
    }
    return context.json({ email });
  });
  return app;
}
