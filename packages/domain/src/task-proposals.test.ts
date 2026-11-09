import { describe, expect, it } from 'vitest';

import { taskProposals } from './task-proposals';

describe('taskProposals', () => {
  it('turns each ask the extraction found in a message into a task proposal titled with the ask, carrying its due time, the message link and the account', () => {
    const message = {
      messageId: 'message-budget',
      accountEmail: 'franciscoc@psmutuus.com',
      link: 'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-budget',
      asks: [
        { ask: 'Review the Q3 budget spreadsheet and send comments', due: '2026-11-12T23:00:00.000Z' },
        { ask: 'Confirm the offsite venue' },
      ],
    };

    expect(taskProposals(message)).toEqual([
      {
        title: 'Review the Q3 budget spreadsheet and send comments',
        due: '2026-11-12T23:00:00.000Z',
        link: 'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-budget',
        accountEmail: 'franciscoc@psmutuus.com',
      },
      {
        title: 'Confirm the offsite venue',
        link: 'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-budget',
        accountEmail: 'franciscoc@psmutuus.com',
      },
    ]);
  });
});
