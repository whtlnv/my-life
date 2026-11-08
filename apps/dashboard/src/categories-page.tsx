import { useEffect, useState, type CSSProperties } from 'react';

import { accountName } from './account-name';
import { categoryLabel, categorySwatches } from './category-labels';

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

const rateClass = (rate: number | undefined) => {
  if (rate === undefined) return 'pill pill-muted';
  if (rate >= 0.9) return 'pill pill-success';
  if (rate >= 0.7) return 'pill pill-warning';
  return 'pill pill-danger';
};

const RecentProposalList = ({ category, proposals }: { category: string; proposals: RecentProposal[] }) => (
  <ul className="rows" aria-label={`${category} proposals`}>
    {proposals.length === 0 && <li className="row-detail">No proposals in this category yet.</li>}
    {proposals.map((proposal) => (
      <li key={proposal.link} className="row">
        <div className="row-main">
          <p className="row-title">{proposal.summary}</p>
        </div>
        <div className="row-side">
          <span className="pill pill-accent">{proposal.action}</span>
          <span>{accountName(proposal.accountEmail)}</span>
          <a href={proposal.link} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
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

const CategoryItem = ({ row, expanded, onFlip, onExpand }: CategoryItemProps) => {
  const automatic = row.mode === 'automatic';
  const style = { '--swatch': categorySwatches[row.category] } as CSSProperties;
  return (
    <li className="card category-row" style={style}>
      <div className="category-head">
        <span className="group-swatch" aria-hidden="true" />
        <span className="group-label">{categoryLabel(row.category)}</span>
        <span className={rateClass(row.agreementRate)}>{rateText(row.agreementRate)}</span>
        <span className="spacer" />
        <span className="mode-text">{automatic ? 'Automatic' : 'Advise'}</span>
        <button
          type="button"
          role="switch"
          aria-label={row.category}
          aria-checked={automatic}
          className="switch"
          onClick={onFlip}
        >
          <span className="switch-knob" aria-hidden="true" />
        </button>
      </div>
      <button type="button" className="button button-quiet" aria-expanded={expanded} onClick={onExpand}>
        Recent proposals
      </button>
      {expanded && <RecentProposalList category={row.category} proposals={row.recentProposals} />}
    </li>
  );
};

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
    <main>
      <header className="page-header">
        <h1 className="page-title">Categories</h1>
        <p className="page-meta">
          Advise asks you first. Automatic acts on new proposals by itself, labeled <code>my-life/auto</code> in Gmail
        </p>
      </header>
      <ul className="stack" aria-label="Categories">
        {categories.map((row) => (
          <CategoryItem
            key={row.category}
            row={row}
            expanded={expanded === row.category}
            onFlip={() => {
              flipMode(row);
            }}
            onExpand={() => {
              setExpanded(expanded === row.category ? undefined : row.category);
            }}
          />
        ))}
      </ul>
      <section className="section">
        <h2 className="section-title">Kill switch</h2>
        <div className="card">
          <p className="card-summary">Something went wrong? One click returns every category to advise.</p>
          <p className="join">
            <button type="button" className="button button-danger" onClick={killSwitch}>
              {killSwitchLabel}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
};
