import { describe, expect, it } from 'vitest';

import { mailReport } from './mail-report';

const message = {
  id: 'message-1',
  threadId: 'thread-1',
  from: 'Ana <ana@example.com>',
  to: 'Francisco <francisco@example.com>',
  cc: 'Luis <luis@example.com>',
  subject: 'Quarterly numbers',
  date: 'Fri, 06 Nov 2026 10:15:00 -0600',
  snippet: 'Can you review the attached numbers before Monday?',
  listId: '<finance.example.com>',
};

function reportWith(messages: unknown[]) {
  return { accountEmail: 'francisco@example.com', historyId: '987654', messages };
}

describe('mailReport', () => {
  it('accepts a report with the account email, the history id and a message with its headers and snippet', () => {
    const report = reportWith([message]);

    expect(mailReport.parse(report)).toEqual(report);
  });

  it('rejects a report whose message has no id', () => {
    const report = reportWith([{ ...message, id: undefined }]);

    expect(mailReport.safeParse(report).success).toBe(false);
  });

  it('accepts a report whose message has no Cc header', () => {
    const messageWithoutCc = Object.fromEntries(Object.entries(message).filter(([key]) => key !== 'cc'));
    const report = reportWith([messageWithoutCc]);

    expect(mailReport.parse(report)).toEqual(report);
  });

  it('accepts a report whose message has no List-Id header', () => {
    const messageWithoutListId = Object.fromEntries(Object.entries(message).filter(([key]) => key !== 'listId'));
    const report = reportWith([messageWithoutListId]);

    expect(mailReport.parse(report)).toEqual(report);
  });
});
