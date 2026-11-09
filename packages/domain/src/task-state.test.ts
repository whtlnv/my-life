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

  it('removes a task from the open tasks once it is marked done', () => {
    const link = 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-budget';
    const events = [
      {
        type: 'proposal-confirmed' as const,
        taskId: 'task-budget',
        at: '2026-11-09T15:00:00.000Z',
        proposal: {
          title: 'Review the Q3 budget spreadsheet and send comments',
          link,
          accountEmail: 'ana@example.com',
        },
      },
      { type: 'done' as const, taskId: 'task-budget', at: '2026-11-09T17:30:00.000Z' },
    ];

    expect(openTasks(events)).toEqual([]);
  });

  it('leaves a task snoozed until a time out of the open tasks before that time', () => {
    const link = 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-budget';
    const events = [
      {
        type: 'proposal-confirmed' as const,
        taskId: 'task-budget',
        at: '2026-11-09T15:00:00.000Z',
        proposal: {
          title: 'Review the Q3 budget spreadsheet and send comments',
          link,
          accountEmail: 'ana@example.com',
        },
      },
      {
        type: 'snoozed' as const,
        taskId: 'task-budget',
        at: '2026-11-09T16:00:00.000Z',
        until: '2026-11-10T15:00:00.000Z',
      },
    ];

    expect(openTasks(events, '2026-11-09T18:00:00.000Z')).toEqual([]);
  });

  it('brings a task snoozed until a time written with a UTC offset back among the open tasks once that time has passed', () => {
    const link = 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-budget';
    const events = [
      {
        type: 'proposal-confirmed' as const,
        taskId: 'task-budget',
        at: '2026-11-09T15:00:00.000Z',
        proposal: {
          title: 'Review the Q3 budget spreadsheet and send comments',
          link,
          accountEmail: 'ana@example.com',
        },
      },
      {
        type: 'snoozed' as const,
        taskId: 'task-budget',
        at: '2026-11-09T16:00:00.000Z',
        until: '2026-11-10T16:00:00.000+01:00',
      },
    ];

    expect(openTasks(events, '2026-11-10T15:30:00.000Z')).toEqual([
      {
        id: 'task-budget',
        title: 'Review the Q3 budget spreadsheet and send comments',
        link,
        accountEmail: 'ana@example.com',
        status: 'open',
      },
    ]);
  });
});
