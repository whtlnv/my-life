export interface ExpenseProposal {
  messageId: string;
  date: string;
  accountEmail: string;
  category: string;
  action: string;
  extract: { vendor: string; amount: number; currency: string; date: string };
  link: string;
}

export interface ExpenseStatementEntry {
  vendor: string;
  amount: number;
  currency: string;
  date: string;
  accountEmail: string;
  link: string;
}

const localCalendarDate = (instant: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date(instant));

const sundayOf = (monday: string): string =>
  new Date(Date.parse(`${monday}T00:00:00.000Z`) + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const expenseStatement = (
  proposals: ExpenseProposal[],
  period: { week: string; timeZone: string },
): ExpenseStatementEntry[] =>
  proposals
    .filter((proposal) => {
      const messageDate = localCalendarDate(proposal.date, period.timeZone);
      return period.week <= messageDate && messageDate <= sundayOf(period.week);
    })
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((proposal) => ({ ...proposal.extract, accountEmail: proposal.accountEmail, link: proposal.link }));
