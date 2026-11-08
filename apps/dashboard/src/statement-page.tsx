import { useEffect, useState } from 'react';

interface StatementEntry {
  vendor: string;
  amount: number;
  currency: string;
}

const parseStatement = (csv: string): StatementEntry[] =>
  csv
    .split('\n')
    .slice(1)
    .filter((line) => line !== '')
    .map((line) => {
      const [vendor = '', amount = '', currency = ''] = line.split(',');
      return { vendor, amount: Number(amount), currency };
    });

const totalsByCurrency = (entries: StatementEntry[]) => {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.currency, (totals.get(entry.currency) ?? 0) + entry.amount);
  }
  return [...totals];
};

const StatementRow = ({ label, amount, currency }: { label: string; amount: number; currency: string }) => (
  <tr>
    <td>{label}</td>
    <td>{amount}</td>
    <td>{currency}</td>
  </tr>
);

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const statementUrl = (weekOffset: number) => {
  if (weekOffset === 0) {
    return '/expense-statement';
  }
  const today = new Date();
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * millisecondsPerDay);
  const week = new Date(monday.getTime() + weekOffset * 7 * millisecondsPerDay).toISOString().slice(0, 10);
  return `/expense-statement?week=${week}`;
};

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
    <section>
      <button
        type="button"
        onClick={() => {
          setWeekOffset(weekOffset - 1);
        }}
      >
        Previous week
      </button>
      <button
        type="button"
        onClick={() => {
          setWeekOffset(weekOffset + 1);
        }}
      >
        Next week
      </button>
      <a href="/expense-statement">Download</a>
      <table>
        <tbody>
          {entries.map((entry, index) => (
            <StatementRow key={index} label={entry.vendor} amount={entry.amount} currency={entry.currency} />
          ))}
          {totalsByCurrency(entries).map(([currency, total]) => (
            <StatementRow key={currency} label="Total" amount={total} currency={currency} />
          ))}
        </tbody>
      </table>
    </section>
  );
};
