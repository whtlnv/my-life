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

export const killSwitchLabel = 'Kill switch: every category back to advise';

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

interface CategoryItemProps {
  row: CategoryRow;
  expanded: boolean;
  onFlip: () => void;
  onExpand: () => void;
}

const CategoryItem = ({ row, expanded, onFlip, onExpand }: CategoryItemProps) => (
  <li>
    <span>{rateText(row.agreementRate)}</span>
    <button type="button" role="switch" aria-checked={row.mode === 'automatic'} onClick={onFlip}>
      {row.category}
    </button>
    <button type="button" aria-expanded={expanded} onClick={onExpand}>
      Recent proposals
    </button>
    {expanded && <RecentProposalList category={row.category} proposals={row.recentProposals} />}
  </li>
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

  const killSwitch = () => {
    void fetch('/categories/kill-switch', { method: 'POST' }).then(loadCategories);
  };

  return (
    <>
      <button type="button" onClick={killSwitch}>
        {killSwitchLabel}
      </button>
      <ul aria-label="Categories">
        {categories.map((row) => (
          <CategoryItem
            key={row.category}
            row={row}
            expanded={expanded === row.category}
            onFlip={() => {
              flipMode(row);
            }}
            onExpand={() => {
              setExpanded(row.category);
            }}
          />
        ))}
      </ul>
    </>
  );
};
