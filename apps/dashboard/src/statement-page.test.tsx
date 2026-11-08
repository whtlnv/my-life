import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatementPage } from './statement-page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StatementPage', () => {
  it("shows the current week's entries from GET /expense-statement in a table with a total per currency, and a Download link to that CSV", async () => {
    const csv = [
      'vendor,amount,currency,date,account,link',
      'Telmex,1200,MXN,2026-11-02T16:00:00.000Z,francisco@erlia.mx,https://mail.google.com/mail/u/francisco@erlia.mx/#all/m1',
      'GitHub,20,USD,2026-11-03T16:00:00.000Z,franciscoc@psmutuus.com,https://mail.google.com/mail/u/franciscoc@psmutuus.com/#all/m2',
      'CFE,300,MXN,2026-11-04T16:00:00.000Z,francisco@erlia.mx,https://mail.google.com/mail/u/francisco@erlia.mx/#all/m3',
      '',
    ].join('\n');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (input === '/expense-statement') {
          return Promise.resolve(new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8' } }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    render(<StatementPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Telmex')).toBeInTheDocument();
    expect(within(table).getByText('GitHub')).toBeInTheDocument();
    expect(within(table).getByText('CFE')).toBeInTheDocument();
    const totalRows = within(table)
      .getAllByRole('row')
      .filter((row) => /1,?500/.test(row.textContent ?? ''));
    expect(totalRows).toHaveLength(1);
    expect(totalRows[0]?.textContent).toContain('MXN');
    const downloadLink = screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/expense-statement');
    expect(downloadLink).toBeDefined();
  });
});
