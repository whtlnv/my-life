import { useEffect, useState } from 'react';

import { accountName } from './account-name';

interface StatementEntry {
  vendor: string;
  amount: number;
  currency: string;
  date: string;
  accountEmail: string;
  link: string;
}

// One CSV line as the backend writes it: fields separated by commas, a field holding a comma or a quote wrapped in
// quotes with inner quotes doubled.
export const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (quoted) {
      if (character === '"' && line.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
};

const parseStatement = (csv: string): StatementEntry[] =>
  csv
    .split('\n')
    .slice(1)
    .filter((line) => line !== '')
    .map((line) => {
      const [vendor = '', amount = '', currency = '', date = '', accountEmail = '', link = ''] = parseCsvLine(line);
      return { vendor, amount: Number(amount), currency, date, accountEmail, link };
    });

const totalsByCurrency = (entries: StatementEntry[]) => {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.currency, (totals.get(entry.currency) ?? 0) + entry.amount);
  }
  return [...totals];
};

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

const dayOf = (date: string) => (date.length > 10 ? date.slice(0, 10) : date);

const StatementTable = ({ entries }: { entries: StatementEntry[] }) => (
  <table className="table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Vendor</th>
        <th>Account</th>
        <th className="amount">Amount</th>
      </tr>
    </thead>
    <tbody>
      {entries.map((entry, index) => (
        <tr key={index}>
          <td className="muted">{dayOf(entry.date)}</td>
          <td>
            {entry.link === '' ? (
              entry.vendor
            ) : (
              <a href={entry.link} target="_blank" rel="noreferrer">
                {entry.vendor}
              </a>
            )}
          </td>
          <td className="muted">{entry.accountEmail === '' ? '' : accountName(entry.accountEmail)}</td>
          <td className="amount">
            {formatAmount(entry.amount)} {entry.currency}
          </td>
        </tr>
      ))}
      {totalsByCurrency(entries).map(([currency, total]) => (
        <tr key={currency} className="total-row">
          <td />
          <td>Total</td>
          <td />
          <td className="amount">
            {formatAmount(total)} {currency}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const mondayOf = (day: Date) => new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * millisecondsPerDay);

const addWeeks = (day: Date, weeks: number) => new Date(day.getTime() + weeks * 7 * millisecondsPerDay);

const isoDay = (day: Date) => day.toISOString().slice(0, 10);

const weekStart = (weekOffset: number) => addWeeks(mondayOf(new Date()), weekOffset);

const statementUrl = (weekOffset: number) =>
  weekOffset === 0 ? '/expense-statement' : `/expense-statement?week=${isoDay(weekStart(weekOffset))}`;

const weekLabel = (weekOffset: number) => {
  const monday = weekStart(weekOffset);
  const sunday = new Date(monday.getTime() + 6 * millisecondsPerDay);
  const format = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `Week of ${format.format(monday)} – ${format.format(sunday)}`;
};

export const noExpensesText = 'No expenses this week';

export const StatementPage = () => {
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    void fetch(statementUrl(weekOffset))
      .then((response) => response.text())
      .then((csv) => {
        setEntries(parseStatement(csv));
      });
  }, [weekOffset]);

  return (
    <main>
      <header className="page-header">
        <h1 className="page-title">Statement</h1>
        <p className="page-meta">Every confirmed expense of the week, ready for accounting.</p>
      </header>
      <div className="toolbar">
        <button
          type="button"
          className="button"
          onClick={() => {
            setWeekOffset(weekOffset - 1);
          }}
        >
          ← Previous week
        </button>
        <span className="toolbar-title">
          {weekLabel(weekOffset)}
          {weekOffset === 0 && <span className="pill pill-accent">this week</span>}
        </span>
        <button
          type="button"
          className="button"
          onClick={() => {
            setWeekOffset(weekOffset + 1);
          }}
        >
          Next week →
        </button>
        <span className="spacer" />
        <a className="button button-primary" href={statementUrl(weekOffset)} download>
          Download CSV
        </a>
      </div>
      {entries.length === 0 ? (
        <p className="empty">
          <strong>{noExpensesText}</strong>
          Confirmed expense proposals dated inside the week land here.
        </p>
      ) : (
        <div className="card table-card">
          <StatementTable entries={entries} />
        </div>
      )}
    </main>
  );
};
