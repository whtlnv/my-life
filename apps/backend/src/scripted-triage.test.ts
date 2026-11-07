import { describe, expect, it } from 'vitest';

import { createScriptedTriage } from './scripted-triage';

const archiveCcThread = {
  action: 'archive',
  category: 'cc-thread',
  summary: 'Luis shared the budget with the team',
  extract: { sinceLastMessage: 'Luis shared the budget' },
  reason: 'The user is only copied',
};

const keepSales = {
  action: 'keep',
  category: 'sales',
  summary: 'Acme pitches invoicing software',
  extract: { company: 'Acme', solution: 'Invoicing software', problemSolved: 'Manual invoicing' },
  reason: 'A vendor the user may want to check later',
};

describe('createScriptedTriage', () => {
  it('answers the proposals it was scripted with, in order, and costs what it was scripted to cost', async () => {
    const triage = createScriptedTriage([
      { proposal: archiveCcThread, costInUsd: 0.25 },
      { proposal: keepSales, costInUsd: 0.5 },
    ]);

    const first = await triage.propose({ id: 'message-1', date: 'Mon, 2 Nov 2026 09:00:00 -0600' });
    const second = await triage.propose({ id: 'message-2', date: 'Mon, 2 Nov 2026 10:00:00 -0600' });

    expect(first).toMatchObject({ proposal: archiveCcThread, costInUsd: 0.25 });
    expect(second).toMatchObject({ proposal: keepSales, costInUsd: 0.5 });
  });
});
