import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { noExpensesText, StatementPage } from './statement-page';

const csvResponse = (csv: string) => new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8' } });

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
          return Promise.resolve(csvResponse(csv));
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
      .filter((row) => /1,?500/.test(row.textContent));
    expect(totalRows).toHaveLength(1);
    expect(totalRows[0]?.textContent).toContain('MXN');
    const downloadLink = screen.getByRole('link', { name: /download/i });
    expect(downloadLink).toHaveAttribute('href', '/expense-statement');
    expect(downloadLink).toHaveAttribute('download');
  });

  it("loads and shows the previous week's entries, then the current week's again, through the previous / next week controls", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.setSystemTime(new Date('2026-11-04T18:00:00.000Z'));
    const header = 'vendor,amount,currency,date,account,link';
    const csvByWeek: Record<string, string> = {
      '2026-11-02': [
        header,
        'Telmex,1200,MXN,2026-11-02T16:00:00.000Z,owner@example.com,https://mail.google.com/m1',
        '',
      ].join('\n'),
      '2026-10-26': [
        header,
        'Uber,250,MXN,2026-10-28T16:00:00.000Z,owner@example.com,https://mail.google.com/m0',
        '',
      ].join('\n'),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : input.toString(), 'http://localhost');
        const week = url.searchParams.get('week') ?? '2026-11-02';
        const csv = url.pathname === '/expense-statement' ? csvByWeek[week] : undefined;
        if (csv !== undefined) {
          return Promise.resolve(csvResponse(csv));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    render(<StatementPage />);
    expect(await within(await screen.findByRole('table')).findByText('Telmex')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /previous week/i }));
    const table = screen.getByRole('table');
    expect(await within(table).findByText('Uber')).toBeInTheDocument();
    expect(within(table).queryByText('Telmex')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /next week/i }));
    expect(await within(screen.getByRole('table')).findByText('Telmex')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('Uber')).not.toBeInTheDocument();
  });

  it('shows an empty state instead of the table for a week with no expenses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(csvResponse('vendor,amount,currency,date,account,link\n'))),
    );

    render(<StatementPage />);

    expect(await screen.findByText(noExpensesText)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('reads a quoted vendor holding a comma and doubled quotes, and shows the date, account and a link to the message', async () => {
    const csv = [
      'vendor,amount,currency,date,account,link',
      '"Tacos ""El Güero"", S.A.",85.5,MXN,2026-11-03,franciscoc@psmutuus.com,https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/m-tacos',
      '',
    ].join('\n');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(csvResponse(csv))),
    );

    render(<StatementPage />);

    const table = await screen.findByRole('table');
    const vendorLink = within(table).getByRole('link', { name: 'Tacos "El Güero", S.A.' });
    expect(vendorLink).toHaveAttribute(
      'href',
      'https://mail.google.com/mail/?authuser=franciscoc%40psmutuus.com#all/m-tacos',
    );
    const row = vendorLink.closest('tr');
    expect(row).toHaveTextContent('2026-11-03');
    expect(row).toHaveTextContent('psmutuus');
    expect(row).toHaveTextContent('85.50 MXN');
  });

  it('reads a quoted vendor holding a line break as one entry with that vendor intact', async () => {
    const csv = [
      'vendor,amount,currency,date,account,link',
      '"Acme\nWest Branch",120,MXN,2026-11-03,ana@example.com,https://mail.google.com/mail/?authuser=ana%40example.com#all/m-acme',
      '',
    ].join('\n');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(csvResponse(csv))),
    );

    render(<StatementPage />);

    const table = await screen.findByRole('table');
    const vendorLink = within(table).getByRole('link', { name: /Acme\s+West Branch/ });
    expect(vendorLink).toHaveAttribute('href', 'https://mail.google.com/mail/?authuser=ana%40example.com#all/m-acme');
    const row = vendorLink.closest('tr');
    expect(row).toHaveTextContent('2026-11-03');
    expect(row).toHaveTextContent('120.00 MXN');
    expect(within(table).getAllByRole('link')).toHaveLength(1);
  });
});
