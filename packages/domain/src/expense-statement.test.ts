import { describe, expect, it } from 'vitest';

import { expenseStatement } from './expense-statement';

const expenseProposal = (messageId: string, date: string, vendor: string, amount: number, invoiceDate: string) => ({
  messageId,
  date,
  accountEmail: 'franciscoc@psmutuus.com',
  category: 'expense',
  action: 'archive',
  extract: { vendor, amount, currency: 'MXN', date: invoiceDate },
  link: `https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/${messageId}`,
});

describe('expenseStatement', () => {
  it('holds every expense proposal whose message date falls in the requested Monday–Sunday business week, sorted by date', () => {
    const proposals = [
      expenseProposal('message-late-sunday', '2026-11-09T05:00:00.000Z', 'Telmex', 899, '2026-11-08'),
      expenseProposal('message-monday', '2026-11-02T16:00:00.000Z', 'Uber', 154.5, '2026-11-02'),
      expenseProposal('message-wednesday', '2026-11-04T19:30:00.000Z', 'AWS', 1200, '2026-11-04'),
    ];

    expect(expenseStatement(proposals, { week: '2026-11-02', timeZone: 'America/Mexico_City' })).toEqual([
      {
        vendor: 'Uber',
        amount: 154.5,
        currency: 'MXN',
        date: '2026-11-02',
        accountEmail: 'franciscoc@psmutuus.com',
        link: 'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-monday',
      },
      {
        vendor: 'AWS',
        amount: 1200,
        currency: 'MXN',
        date: '2026-11-04',
        accountEmail: 'franciscoc@psmutuus.com',
        link: 'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-wednesday',
      },
      {
        vendor: 'Telmex',
        amount: 899,
        currency: 'MXN',
        date: '2026-11-08',
        accountEmail: 'franciscoc@psmutuus.com',
        link: 'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-late-sunday',
      },
    ]);
  });

  it('leaves out an expense proposal whose message date falls outside the requested business week', () => {
    const proposals = [
      expenseProposal('message-previous-sunday', '2026-11-02T05:59:00.000Z', 'Netflix', 299, '2026-11-01'),
      expenseProposal('message-tuesday', '2026-11-03T18:00:00.000Z', 'Uber', 154.5, '2026-11-03'),
      expenseProposal('message-next-monday', '2026-11-09T06:00:00.000Z', 'Telmex', 899, '2026-11-09'),
    ];

    expect(
      expenseStatement(proposals, { week: '2026-11-02', timeZone: 'America/Mexico_City' }).map((entry) => entry.link),
    ).toEqual(['https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-tuesday']);
  });

  it('leaves out a proposal of another category dated inside the week, even when its extract carries an amount', () => {
    const proposals = [
      { ...expenseProposal('message-sales', '2026-11-03T18:00:00.000Z', 'Acme CRM', 4999, '2026-11-03'), category: 'sales' },
      expenseProposal('message-expense', '2026-11-04T18:00:00.000Z', 'Uber', 154.5, '2026-11-04'),
      {
        ...expenseProposal('message-system-update', '2026-11-05T18:00:00.000Z', 'GitHub', 21, '2026-11-05'),
        category: 'system-update',
      },
    ];

    expect(
      expenseStatement(proposals, { week: '2026-11-02', timeZone: 'America/Mexico_City' }).map((entry) => entry.link),
    ).toEqual(['https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/message-expense']);
  });
});
