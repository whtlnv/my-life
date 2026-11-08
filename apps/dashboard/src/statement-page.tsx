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
            <tr key={index}>
              <td>{entry.vendor}</td>
              <td>{entry.amount}</td>
              <td>{entry.currency}</td>
            </tr>
          ))}
          {totalsByCurrency(entries).map(([currency, total]) => (
            <tr key={currency}>
              <td>Total</td>
              <td>{total}</td>
              <td>{currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
