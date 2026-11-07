import { useEffect, useState } from 'react';

import { accountName } from './account-name';

interface RecentProposal {
  summary: string;
  action: string;
  accountEmail: string;
  link: string;
}

interface CategoryRow {
  category: string;
  mode: 'advise' | 'automatic';
  agreementRate?: number;
  recentProposals: RecentProposal[];
}

interface CategoriesResponse {
  categories: CategoryRow[];
}

export const agreementRateText = (rate: number) => `${String(Math.round(rate * 100))}% agreement`;

export const noProposalsYetText = 'no proposals yet';

const rateText = (rate: number | undefined) => (rate === undefined ? noProposalsYetText : agreementRateText(rate));

const RecentProposalList = ({ category, proposals }: { category: string; proposals: RecentProposal[] }) => (
  <ul aria-label={`${category} proposals`}>
    {proposals.map((proposal) => (
      <li key={proposal.link}>
        <span>{proposal.summary}</span>
        <span>{proposal.action}</span>
        <span>{accountName(proposal.accountEmail)}</span>
        <a href={proposal.link}>Open</a>
      </li>
    ))}
  </ul>
);

export const CategoriesPage = () => {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [expanded, setExpanded] = useState<string | undefined>();

  const loadCategories = () =>
    fetch('/categories')
      .then((response) => response.json() as Promise<CategoriesResponse>)
      .then((body) => {
        setCategories(body.categories);
      });

  useEffect(() => {
    void loadCategories();
  }, []);

  const flipMode = (row: CategoryRow) => {
    const mode = row.mode === 'automatic' ? 'advise' : 'automatic';
    void fetch(`/categories/${row.category}/mode`, { method: 'PUT', body: JSON.stringify({ mode }) }).then(
      loadCategories,
    );
  };

  return (
    <ul aria-label="Categories">
      {categories.map((row) => (
        <li key={row.category}>
          <span>{rateText(row.agreementRate)}</span>
          <button
            type="button"
            role="switch"
            aria-checked={row.mode === 'automatic'}
            onClick={() => {
              flipMode(row);
            }}
          >
            {row.category}
          </button>
          <button
            type="button"
            aria-expanded={expanded === row.category}
            onClick={() => {
              setExpanded(row.category);
            }}
          >
            Recent proposals
          </button>
          {expanded === row.category && <RecentProposalList category={row.category} proposals={row.recentProposals} />}
        </li>
      ))}
    </ul>
  );
};
