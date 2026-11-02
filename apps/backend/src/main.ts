import { serve } from '@hono/node-server';

import { createApp } from './app';

// Localhost only (CLAUDE.md locked decision 19): the extension and the dashboard are the only clients.
const port = Number(process.env.MY_LIFE_PORT ?? 7777);
serve({ fetch: createApp().fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`my-life backend listening on http://127.0.0.1:${String(info.port)}`);
});
