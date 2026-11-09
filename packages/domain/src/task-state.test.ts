import { describe, expect, it } from 'vitest';

import { openTasks } from './task-state';

describe('openTasks', () => {
  it('creates an open task from a confirmed task proposal and none from a rejected one', () => {
    const link = 'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-budget';
    const events = [
      {
        type: 'proposal-confirmed' as const,
        taskId: 'task-budget',
        at: '2026-11-09T15:00:00.000Z',
        proposal: {
          title: 'Review the Q3 budget spreadsheet and send comments',
          due: '2026-11-12T23:00:00.000Z',
          link,
          accountEmail: 'franciscoc@psmutuus.com',
        },
      },
      {
        type: 'proposal-rejected' as const,
        taskId: 'task-venue',
        at: '2026-11-09T15:01:00.000Z',
        proposal: { title: 'Confirm the offsite venue', link, accountEmail: 'franciscoc@psmutuus.com' },
      },
    ];

    expect(openTasks(events)).toEqual([
      {
        id: 'task-budget',
        title: 'Review the Q3 budget spreadsheet and send comments',
        due: '2026-11-12T23:00:00.000Z',
        link,
        accountEmail: 'franciscoc@psmutuus.com',
        status: 'open',
      },
    ]);
  });
});
