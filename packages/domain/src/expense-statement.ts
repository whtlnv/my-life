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

export const expenseStatement = (
  proposals: ExpenseProposal[],
  _period: { week: string; timeZone: string },
): ExpenseStatementEntry[] =>
  [...proposals]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((proposal) => ({ ...proposal.extract, accountEmail: proposal.accountEmail, link: proposal.link }));
