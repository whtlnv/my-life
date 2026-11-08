export interface ExpenseProposal {
  messageId: string;
  date: string;
  accountEmail: string;
  category: string;
  action: string;
  extract: { vendor: string; amount: number; currency: string; date: string };
  link: string;
  verdict?: { decision: string };
}

export interface ExpenseStatementEntry {
  vendor: string;
  amount: number;
  currency: string;
  date: string;
  accountEmail: string;
  link: string;
}

export interface StatementPeriod {
  week: string;
  timeZone: string;
}

const localCalendarDate = (instant: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date(instant));

const sundayOf = (monday: string): string =>
  new Date(Date.parse(`${monday}T00:00:00.000Z`) + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const isInWeek = (instant: string, period: StatementPeriod): boolean => {
  const messageDate = localCalendarDate(instant, period.timeZone);
  return period.week <= messageDate && messageDate <= sundayOf(period.week);
};

export const expenseStatement = (
  proposals: ExpenseProposal[],
  period: StatementPeriod,
): ExpenseStatementEntry[] =>
  proposals
    .filter((proposal) => proposal.category === 'expense' && proposal.verdict?.decision !== 'rejected' && isInWeek(proposal.date, period))
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((proposal) => ({ ...proposal.extract, accountEmail: proposal.accountEmail, link: proposal.link }));
