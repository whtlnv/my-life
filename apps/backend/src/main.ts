import { homedir } from 'node:os';

import { serve } from '@hono/node-server';

import { createApp } from './app';
import { readStartupSettings } from './startup-settings';

// The shipped composition: settings from the environment (MY_LIFE_*), the SQLite store under Application Support,
// the built dashboard at /. Localhost only (CLAUDE.md locked decision 19): the extension and the dashboard are the
// only clients.
const settings = readStartupSettings(process.env, homedir());
const app = createApp({
  allowedEmails: settings.allowedEmails,
  databasePath: settings.databasePath,
  dashboardDirectory: settings.dashboardDirectory,
});
serve({ fetch: app.fetch, port: settings.port, hostname: '127.0.0.1' }, (info) => {
  console.log(
    `my-life backend listening on http://127.0.0.1:${String(info.port)} · ${String(settings.allowedEmails.length)} allowed account(s) · store ${settings.databasePath}`,
  );
});
