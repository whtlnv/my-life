import { describe, expect, it } from 'vitest';

import { triageProposal } from './triage-proposal';

const archiveCcThreadProposal = {
  action: 'archive',
  category: 'cc-thread',
  summary: 'Luis confirmed the vendor contract is signed',
  extract: { sinceLastMessage: 'Luis confirmed the vendor signed the contract on Thursday.' },
  reason: 'The user is only in Cc and nothing is asked of them.',
};

describe('triageProposal', () => {
  it('accepts an archive proposal for a cc-thread with a summary, the category extract and a reason', () => {
    expect(triageProposal.parse(archiveCcThreadProposal)).toEqual(archiveCcThreadProposal);
  });

  it('rejects a proposal whose category is not one of the seven categories', () => {
    const proposal = { ...archiveCcThreadProposal, category: 'newsletter' };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('rejects a proposal whose action is not archive, keep or act', () => {
    const proposal = { ...archiveCcThreadProposal, action: 'snooze' };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('accepts an act proposal carrying a task draft with a title', () => {
    const proposal = {
      ...archiveCcThreadProposal,
      action: 'act',
      taskDraft: { title: 'Send Luis the signed vendor contract for filing' },
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });

  it('accepts an action proposal whose extract names who asks and what is asked, with no due time', () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Ana asks for the Q3 budget review',
      extract: { asker: 'Ana Ruiz', ask: 'Review the Q3 budget spreadsheet and send comments' },
      reason: 'Sent to the user and asks them to review a document.',
      taskDraft: { title: 'Review the Q3 budget for Ana' },
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });

  it('accepts an action proposal whose extract carries an ISO 8601 due time and keeps it', () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Ana asks for the Q3 budget review by Friday noon',
      extract: { asker: 'Ana Ruiz', ask: 'Review the Q3 budget spreadsheet and send comments', due: '2026-11-13T12:00:00-06:00' },
      reason: 'Sent to the user and asks them to review a document by a deadline.',
      taskDraft: { title: 'Review the Q3 budget for Ana' },
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });

  it('rejects an action proposal whose extract does not say what is asked', () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Ana asks for the Q3 budget review',
      extract: { asker: 'Ana Ruiz', sinceLastMessage: 'Ana shared the Q3 budget spreadsheet.' },
      reason: 'Sent to the user and asks them to review a document.',
      taskDraft: { title: 'Review the Q3 budget for Ana' },
    };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('rejects an action proposal whose extract is a cc-thread extract', () => {
    const proposal = {
      action: 'act',
      category: 'action',
      summary: 'Ana asks for the Q3 budget review',
      extract: { sinceLastMessage: 'Ana shared the Q3 budget spreadsheet.' },
      reason: 'Sent to the user and asks them to review a document.',
      taskDraft: { title: 'Review the Q3 budget for Ana' },
    };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('rejects a cc-thread proposal whose extract is an action extract', () => {
    const proposal = {
      ...archiveCcThreadProposal,
      extract: { asker: 'Luis Ortega', ask: 'Confirm the vendor contract was filed' },
    };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('accepts an expense proposal whose extract has vendor, amount, currency and date', () => {
    const proposal = {
      action: 'keep',
      category: 'expense',
      summary: 'AWS invoice for October',
      extract: { vendor: 'Amazon Web Services', amount: 1250.5, currency: 'USD', date: '2026-11-03' },
      reason: 'An invoice the user files for expenses.',
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });

  it('rejects an expense proposal whose extract has no amount, even when it carries an ask', () => {
    const proposal = {
      action: 'keep',
      category: 'expense',
      summary: 'AWS invoice for October',
      extract: {
        vendor: 'Amazon Web Services',
        currency: 'USD',
        date: '2026-11-03',
        asker: 'AWS Billing',
        ask: 'Pay the October invoice',
      },
      reason: 'An invoice the user files for expenses.',
    };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('accepts a system-update proposal whose extract has the sending system, a severity and a significant flag', () => {
    const proposal = {
      action: 'archive',
      category: 'system-update',
      summary: 'Sentry reports a new error in the checkout service',
      extract: { system: 'Sentry', severity: 'error', significant: true },
      reason: 'An automated notification from a monitoring system.',
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });

  it('rejects a system-update proposal whose extract has no sending system, even when it carries an ask', () => {
    const proposal = {
      action: 'archive',
      category: 'system-update',
      summary: 'Sentry reports a new error in the checkout service',
      extract: { severity: 'error', significant: true, asker: 'Sentry', ask: 'Triage the new error' },
      reason: 'An automated notification from a monitoring system.',
    };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('accepts a sales proposal whose extract has the company, its solution and the problem it solves', () => {
    const proposal = {
      action: 'archive',
      category: 'sales',
      summary: 'Acme pitches an AI scheduling assistant',
      extract: { company: 'Acme', solution: 'AI scheduling assistant', problem: 'Time lost coordinating meetings' },
      reason: 'An unsolicited pitch from a vendor.',
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });

  it('rejects a sales proposal whose extract has no company, even when it carries an ask', () => {
    const proposal = {
      action: 'archive',
      category: 'sales',
      summary: 'Acme pitches an AI scheduling assistant',
      extract: { solution: 'AI scheduling assistant', problem: 'Time lost coordinating meetings', asker: 'Acme', ask: 'Book a demo' },
      reason: 'An unsolicited pitch from a vendor.',
    };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('accepts a calendar-drive proposal whose extract names the event or document and what changed', () => {
    const proposal = {
      action: 'archive',
      category: 'calendar-drive',
      summary: 'Weekly sync moved to Thursday',
      extract: { item: 'Weekly product sync', change: 'Moved from Wednesday 10:00 to Thursday 11:00' },
      reason: 'An automated calendar update with nothing to do.',
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });

  it('rejects a calendar-drive proposal whose extract does not say what changed, even when it carries an ask', () => {
    const proposal = {
      action: 'archive',
      category: 'calendar-drive',
      summary: 'Weekly sync moved to Thursday',
      extract: { item: 'Weekly product sync', asker: 'Google Calendar', ask: 'Accept the new time' },
      reason: 'An automated calendar update with nothing to do.',
    };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('accepts an unknown proposal whose extract is empty', () => {
    const proposal = {
      action: 'keep',
      category: 'unknown',
      summary: 'A message from an unfamiliar sender about an unclear topic',
      extract: {},
      reason: 'Nothing in the message fits a known category.',
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });

  it('accepts a cc-thread proposal whose extract says what happened since the user\'s last message', () => {
    const proposal = {
      action: 'keep',
      category: 'cc-thread',
      summary: 'Marta moved the launch review to next week',
      extract: { sinceLastMessage: 'Marta and Diego agreed to move the launch review to next Tuesday.' },
      reason: 'The user is in Cc on a thread they follow; nothing is asked of them.',
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });
});
