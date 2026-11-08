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

export const StatementPage = () => {
  const [entries, setEntries] = useState<StatementEntry[]>([]);

  useEffect(() => {
    void fetch('/expense-statement')
      .then((response) => response.text())
      .then((csv) => {
        setEntries(parseStatement(csv));
      });
  }, []);

  return (
    <section>
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
