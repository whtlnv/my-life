import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';

import { createApp } from './app';

// The demo instance scripts/demo.sh serves: every account reporting, a meeting in progress, a full triage queue. Its
// triage is scripted (the proposal is looked up by message id), so it costs nothing and needs no key.

const port = Number(process.env.MY_LIFE_DEMO_PORT ?? '7778');
const dashboardDirectory = fileURLToPath(new URL('../../dashboard/dist', import.meta.url));
const databasePath = join(mkdtempSync(join(tmpdir(), 'my-life-demo-')), 'demo.sqlite');

const accounts = {
  psmutuus: 'franciscoc@psmutuus.com',
  erlia: 'francisco@erlia.mx',
  gmail: 'catala.francisco@gmail.com',
  icona: 'it@icona.fun',
};

const now = new Date();
const minutesFromNow = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
const todayAt = (hour: number, minute = 0) => {
  const date = new Date(now);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

const calendarSnapshots = [
  {
    accountEmail: accounts.psmutuus,
    events: [
      {
        id: 'standup',
        iCalUID: 'standup@google.com',
        title: 'Weekly ops sync',
        start: minutesFromNow(-12),
        end: minutesFromNow(18),
        meetLink: 'https://meet.google.com/abc-defg-hij',
        attendees: [
          { email: 'luis@psmutuus.com', displayName: 'Luis Pérez' },
          { email: 'marta@psmutuus.com', displayName: 'Marta Gil' },
          { email: accounts.psmutuus, displayName: 'Francisco Catalá' },
        ],
      },
      {
        id: 'board',
        iCalUID: 'board@google.com',
        title: 'Board prep with Marta',
        start: minutesFromNow(95),
        end: minutesFromNow(155),
        attendees: [{ email: 'marta@psmutuus.com', displayName: 'Marta Gil' }],
      },
    ],
  },
  {
    accountEmail: accounts.erlia,
    events: [
      {
        id: 'design-review',
        iCalUID: 'design-review@google.com',
        title: 'Design review · onboarding flow',
        start: minutesFromNow(26),
        end: minutesFromNow(56),
        meetLink: 'https://meet.google.com/klm-nopq-rst',
        attendees: [{ email: 'ana@erlia.mx', displayName: 'Ana Ruiz' }],
      },
      {
        id: 'focus',
        iCalUID: 'focus@google.com',
        title: 'Focus block',
        start: minutesFromNow(240),
        end: minutesFromNow(360),
        attendees: [],
      },
    ],
  },
  {
    accountEmail: accounts.gmail,
    events: [
      {
        id: 'dentist',
        iCalUID: 'dentist@google.com',
        title: 'Dentist',
        start: todayAt(18, 30),
        end: todayAt(19, 15),
        attendees: [],
      },
      {
        id: 'holiday',
        iCalUID: 'holiday@google.com',
        title: 'Día de muertos (observed)',
        allDay: true,
        start: todayAt(0),
        end: todayAt(23, 59),
        attendees: [],
      },
    ],
  },
  { accountEmail: accounts.icona, events: [] },
];

interface DemoMessage {
  id: string;
  threadId?: string;
  accountEmail: string;
  from: string;
  to?: string;
  cc?: string;
  subject: string;
  minutesAgo: number;
  snippet: string;
  listId?: string;
  proposal: unknown;
}

const messages: DemoMessage[] = [
  {
    id: 'm-budget',
    accountEmail: accounts.psmutuus,
    from: 'Luis Pérez <luis@psmutuus.com>',
    subject: 'Q4 budget review',
    minutesAgo: 35,
    snippet: 'Can you review the Q4 budget before Friday? Finance needs your sign-off on the headcount line.',
    proposal: {
      action: 'act',
      category: 'action',
      summary: 'Luis asks you to review the Q4 budget before Friday',
      extract: {
        asker: 'Luis Pérez',
        ask: 'Review the Q4 budget and sign off the headcount line',
        due: 'Friday 6 Nov',
      },
      reason: 'Addressed to you directly with a dated ask',
      taskDraft: { title: 'Review the Q4 budget' },
    },
  },
  {
    id: 'm-contract',
    accountEmail: accounts.erlia,
    from: 'Marta Gil <marta@cliente.mx>',
    subject: 'Signed contract',
    minutesAgo: 140,
    snippet: 'Hola Francisco, ¿me mandas el contrato firmado? Lo necesitamos mañana al mediodía.',
    proposal: {
      action: 'act',
      category: 'action',
      summary: 'Marta needs the signed contract by tomorrow noon',
      extract: { asker: 'Marta Gil', ask: 'Send the signed contract', due: 'Tomorrow noon' },
      reason: 'A client asks you for a document with a deadline',
      taskDraft: { title: 'Send Marta the signed contract' },
    },
  },
  {
    id: 'm-intro',
    accountEmail: accounts.gmail,
    from: 'Pedro Alcántara <pedro.alcantara@gmail.com>',
    subject: 'Quick question',
    minutesAgo: 400,
    snippet: 'Hey, remember the pallet thing we talked about at the conference? Do you still have the contact?',
    proposal: {
      action: 'keep',
      category: 'unknown',
      summary: 'A note from an unfamiliar sender about a pallet contact',
      extract: {},
      reason: 'Personal mail, no profile context to classify it',
    },
  },
  {
    id: 'm-launch-3',
    threadId: 'thread-launch',
    accountEmail: accounts.psmutuus,
    from: 'Carla Ortiz <carla@psmutuus.com>',
    to: 'product@psmutuus.com',
    cc: accounts.psmutuus,
    subject: 'Re: Re: Launch checklist',
    minutesAgo: 50,
    snippet: 'Legal cleared the copy. Marketing moves the date to the 14th.',
    proposal: {
      action: 'archive',
      category: 'cc-thread',
      summary: 'Launch checklist: legal cleared the copy, launch moved to the 14th',
      extract: { sinceLastMessage: 'Legal cleared the copy; marketing moved the launch to the 14th; no ask for you' },
      reason: 'You are in Cc and nobody asks you anything',
    },
  },
  {
    id: 'm-hiring-2',
    threadId: 'thread-hiring',
    accountEmail: accounts.erlia,
    from: 'Ana Ruiz <ana@erlia.mx>',
    to: 'hiring@erlia.mx',
    cc: accounts.erlia,
    subject: 'Re: Senior designer shortlist',
    minutesAgo: 300,
    snippet: 'Two candidates left after the portfolio round. Interviews next week.',
    proposal: {
      action: 'archive',
      category: 'cc-thread',
      summary: 'Designer shortlist down to two, interviews next week',
      extract: { sinceLastMessage: 'Shortlist narrowed to two candidates; interviews scheduled for next week' },
      reason: 'Status update to a list you are copied on',
    },
  },
  {
    id: 'm-exp-1',
    accountEmail: accounts.psmutuus,
    from: 'Papelería Lumen <facturas@lumen.mx>',
    subject: 'Factura A-2231',
    minutesAgo: 600,
    snippet: 'Adjuntamos la factura A-2231 por $345.50 MXN.',
    proposal: {
      action: 'archive',
      category: 'expense',
      summary: 'Invoice A-2231 from Papelería Lumen',
      extract: { vendor: 'Papelería Lumen', amount: 345.5, currency: 'MXN', date: '2026-11-04' },
      reason: 'An invoice to file for accounting',
    },
  },
  {
    id: 'm-exp-2',
    accountEmail: accounts.erlia,
    from: 'Anthropic <receipts@anthropic.com>',
    subject: 'Your receipt from Anthropic',
    minutesAgo: 1500,
    snippet: 'Receipt for $120.00 USD — API usage credits.',
    proposal: {
      action: 'archive',
      category: 'expense',
      summary: 'Anthropic API credits receipt',
      extract: { vendor: 'Anthropic', amount: 120, currency: 'USD', date: '2026-11-06' },
      reason: 'A receipt to file for accounting',
    },
  },
  {
    id: 'm-exp-3',
    accountEmail: accounts.icona,
    from: 'Amazon Web Services <no-reply@aws.amazon.com>',
    subject: 'Your AWS invoice is available',
    minutesAgo: 2000,
    snippet: 'Invoice for October: $1,842.17 USD.',
    proposal: {
      action: 'archive',
      category: 'expense',
      summary: 'AWS October invoice',
      extract: { vendor: 'Amazon Web Services', amount: 1842.17, currency: 'USD', date: '2026-11-03' },
      reason: 'A monthly invoice to file',
    },
  },
  {
    id: 'm-aws-1',
    accountEmail: accounts.icona,
    from: 'AWS Budgets <no-reply@budgets.amazonaws.com>',
    subject: 'AWS Budgets: 85% of your monthly budget',
    minutesAgo: 20,
    snippet: 'Your production account has used 85% of its monthly budget.',
    proposal: {
      action: 'keep',
      category: 'system-update',
      summary: 'Production account at 85% of the monthly budget',
      extract: { system: 'AWS', severity: 'warning', significant: true },
      reason: 'A budget threshold you asked to be told about',
    },
  },
  {
    id: 'm-aws-2',
    accountEmail: accounts.icona,
    from: 'AWS Health <no-reply@health.amazonaws.com>',
    subject: 'Scheduled maintenance: RDS',
    minutesAgo: 700,
    snippet: 'A maintenance window is scheduled for your RDS instance next Sunday.',
    proposal: {
      action: 'archive',
      category: 'system-update',
      summary: 'RDS maintenance window next Sunday',
      extract: { system: 'AWS', severity: 'info', significant: false },
      reason: 'Routine notice, nothing to do',
    },
  },
  {
    id: 'm-sentry-1',
    accountEmail: accounts.erlia,
    from: 'Sentry <noreply@md.getsentry.com>',
    subject: '[erlia-web] New issue: TypeError in CheckoutForm',
    minutesAgo: 8,
    snippet: 'TypeError: Cannot read properties of undefined (reading "total") — 212 events in the last hour.',
    proposal: {
      action: 'keep',
      category: 'system-update',
      summary: 'New TypeError in CheckoutForm, 212 events in an hour',
      extract: { system: 'Sentry', severity: 'error', significant: true },
      reason: 'A new high-volume error in checkout',
    },
  },
  {
    id: 'm-sentry-2',
    accountEmail: accounts.erlia,
    from: 'Sentry <noreply@md.getsentry.com>',
    subject: '[erlia-web] Weekly report',
    minutesAgo: 1200,
    snippet: 'Your weekly report: 4 new issues, 12 resolved.',
    proposal: {
      action: 'archive',
      category: 'system-update',
      summary: 'Weekly report: 4 new issues, 12 resolved',
      extract: { system: 'Sentry', severity: 'info', significant: false },
      reason: 'Digest mail',
    },
  },
  {
    id: 'm-github-1',
    accountEmail: accounts.erlia,
    from: 'GitHub <notifications@github.com>',
    subject: '[erlia/web] Deploy failed on main',
    minutesAgo: 60,
    snippet: 'Run #4821 failed: lint wall.',
    listId: 'erlia/web <web.erlia.github.com>',
    proposal: {
      action: 'keep',
      category: 'system-update',
      summary: 'Deploy of main failed on the lint wall',
      extract: { system: 'GitHub', severity: 'error', significant: true },
      reason: 'A failed deploy on the main branch',
    },
  },
  {
    id: 'm-sales-1',
    accountEmail: accounts.psmutuus,
    from: 'Jordan Blake <jordan@meetwise.ai>',
    subject: 'Francisco — 15 min this week?',
    minutesAgo: 240,
    snippet: 'Meetwise cuts the time your team spends coordinating meetings by 40%...',
    proposal: {
      action: 'archive',
      category: 'sales',
      summary: 'Meetwise pitches an AI scheduling assistant',
      extract: { company: 'Meetwise', solution: 'AI scheduling assistant', problem: 'Time lost coordinating meetings' },
      reason: 'Cold outreach',
    },
  },
  {
    id: 'm-sales-2',
    accountEmail: accounts.psmutuus,
    from: 'Priya Natarajan <priya@ledgerly.io>',
    subject: 'Close the books in 2 days, not 10',
    minutesAgo: 1300,
    snippet: 'Ledgerly automates month-end close for finance teams of 5–50...',
    proposal: {
      action: 'archive',
      category: 'sales',
      summary: 'Ledgerly pitches automated month-end close',
      extract: { company: 'Ledgerly', solution: 'Automated month-end close', problem: 'Slow book closing' },
      reason: 'Cold outreach',
    },
  },
  {
    id: 'm-sales-3',
    accountEmail: accounts.icona,
    from: 'Tom Eriksen <tom@shieldops.dev>',
    subject: 'Your AWS bill is probably 30% too high',
    minutesAgo: 2600,
    snippet: 'ShieldOps finds idle resources and right-sizes them automatically...',
    proposal: {
      action: 'archive',
      category: 'sales',
      summary: 'ShieldOps pitches AWS cost optimisation',
      extract: { company: 'ShieldOps', solution: 'AWS cost optimisation', problem: 'Over-provisioned cloud spend' },
      reason: 'Cold outreach',
    },
  },
  {
    id: 'm-cal-1',
    accountEmail: accounts.psmutuus,
    from: 'Google Calendar <calendar-notification@google.com>',
    subject: 'Updated invitation: Board prep with Marta',
    minutesAgo: 90,
    snippet: 'This event has been changed. Board prep with Marta, moved 30 minutes later.',
    proposal: {
      action: 'archive',
      category: 'calendar-drive',
      summary: 'Board prep moved 30 minutes later',
      extract: { item: 'Board prep with Marta', change: 'Moved 30 minutes later' },
      reason: 'The calendar already shows it',
    },
  },
  {
    id: 'm-drive-1',
    accountEmail: accounts.erlia,
    from: 'Ana Ruiz (via Google Drive) <drive-shares-dm-noreply@google.com>',
    subject: 'Document shared with you: "Onboarding flow v3"',
    minutesAgo: 110,
    snippet: 'Ana Ruiz shared a document.',
    proposal: {
      action: 'archive',
      category: 'calendar-drive',
      summary: 'Ana shared "Onboarding flow v3"',
      extract: { item: 'Onboarding flow v3', change: 'Shared with you by Ana Ruiz' },
      reason: 'The document is in Drive; the mail adds nothing',
    },
  },
];

const proposalByMessageId = new Map(messages.map((message) => [message.id, message.proposal]));

const app = createApp({
  allowedEmails: Object.values(accounts),
  databasePath,
  dashboardDirectory,
  dailySpendCeilingInUsd: 20,
  triage: {
    propose: (message) =>
      Promise.resolve({ proposal: proposalByMessageId.get(message.id), costInUsd: 0.018, promptVersion: 'triage-v1' }),
  },
});

const postJson = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function seed(): Promise<void> {
  for (const snapshot of calendarSnapshots) {
    await postJson('/register', { email: snapshot.accountEmail });
    await postJson('/calendar-snapshot', snapshot);
  }
  for (const accountEmail of Object.values(accounts)) {
    await postJson('/mail-report', {
      accountEmail,
      historyId: '1',
      messages: messages
        .filter((message) => message.accountEmail === accountEmail)
        .map((message) => ({
          id: message.id,
          threadId: message.threadId ?? `thread-${message.id}`,
          from: message.from,
          to: message.to ?? accountEmail,
          ...(message.cc === undefined ? {} : { cc: message.cc }),
          subject: message.subject,
          date: minutesFromNow(-message.minutesAgo),
          snippet: message.snippet,
          ...(message.listId === undefined ? {} : { listId: message.listId }),
        })),
    });
  }
  await app.request('/triage-run', { method: 'POST' });
}

// Keep every source fresh: the real extensions report every minute (mail) and every five (calendar).
async function report(): Promise<void> {
  for (const snapshot of calendarSnapshots) await postJson('/calendar-snapshot', snapshot);
  for (const accountEmail of Object.values(accounts)) {
    await postJson('/mail-report', { accountEmail, historyId: '2', messages: [] });
  }
}

await seed();
setInterval(() => {
  report().catch((error: unknown) => {
    console.error('demo report failed', error);
  });
}, 60_000);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`my-life demo listening on http://127.0.0.1:${String(info.port)} · store ${databasePath}`);
});
