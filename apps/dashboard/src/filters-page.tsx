import { useEffect, useState } from 'react';

import { businessTimeZone } from './app-shell';
import { accountName } from './account-name';

interface FilterDefinition {
  criteria: Record<string, string>;
  labelName: string;
  accountEmail: string;
}

interface FilterProposal extends FilterDefinition {
  id: string;
  archiveCount?: number;
}

interface FilterProposalsResponse {
  proposals: FilterProposal[];
}

interface CreatedFilter extends FilterDefinition {
  gmailFilterId: string;
  approvedAt?: string;
  acknowledgedAt?: string;
}

interface FiltersResponse {
  filters: CreatedFilter[];
}

export const approveLabel = 'Approve';

export const rejectLabel = 'Reject';

export const deleteLabel = 'Delete';

export const noFiltersText = 'No filter proposals or filters';

const criterionNames: Record<string, string> = { from: 'from', subject: 'subject contains', listId: 'list' };

function timeInBusinessZone(isoTime: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: businessTimeZone,
  }).format(new Date(isoTime));
}

const FilterSummary = ({ filter }: { filter: FilterDefinition }) => (
  <>
    <div className="card-head">
      <span className="pill pill-accent">{filter.labelName}</span>
      <span className="pill">{accountName(filter.accountEmail)}</span>
    </div>
    <p className="card-ask criteria">
      {Object.entries(filter.criteria).map(([name, value]) => (
        <span key={name} className="criterion">
          <span className="criterion-name">{criterionNames[name] ?? name}</span> <code>{value}</code>
        </span>
      ))}
    </p>
  </>
);

export const FiltersPage = () => {
  const [proposals, setProposals] = useState<FilterProposal[]>([]);
  const [filters, setFilters] = useState<CreatedFilter[]>([]);

  const loadAll = () => {
    void fetch('/filter-proposals')
      .then((response) => response.json() as Promise<FilterProposalsResponse>)
      .then((body) => {
        setProposals(body.proposals);
      });
    void fetch('/filters')
      .then((response) => response.json() as Promise<FiltersResponse>)
      .then((body) => {
        setFilters(body.filters);
      });
  };

  useEffect(loadAll, []);

  const decide = (proposal: FilterProposal, decision: 'approval' | 'rejection') => {
    void fetch(`/filter-proposals/${proposal.id}/${decision}`, { method: 'POST' }).then(loadAll);
  };

  const remove = (filter: CreatedFilter) => {
    void fetch(`/filters/${filter.gmailFilterId}`, { method: 'DELETE' }).then(loadAll);
  };

  return (
    <main>
      <header className="page-header">
        <h1 className="page-title">Filters</h1>
        <p className="page-meta">
          After three confirmed archives from one sender, Claude proposes a Gmail filter. Approved filters run inside
          Gmail even when this app is off.
        </p>
      </header>
      {proposals.length === 0 && filters.length === 0 && (
        <p className="empty">
          <strong>{noFiltersText}</strong>
          Keep archiving; proposals appear here after the third confirmed archive from the same sender.
        </p>
      )}
      {proposals.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            Proposals <span className="count">{proposals.length}</span>
          </h2>
          <ul className="stack" aria-label="Filter proposals">
            {proposals.map((proposal) => (
              <li key={proposal.id} className="card card-hero">
                <FilterSummary filter={proposal} />
                <div className="card-foot">
                  {proposal.archiveCount !== undefined && (
                    <span className="card-note">
                      {String(proposal.archiveCount)} confirmed archives behind this proposal
                    </span>
                  )}
                  <span className="spacer" />
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => {
                      decide(proposal, 'approval');
                    }}
                  >
                    {approveLabel}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      decide(proposal, 'rejection');
                    }}
                  >
                    {rejectLabel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {filters.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            Created filters <span className="count">{filters.length}</span>
          </h2>
          <ul className="stack" aria-label="Created filters">
            {filters.map((filter) => (
              <li key={filter.gmailFilterId} className="card">
                <FilterSummary filter={filter} />
                <div className="card-foot">
                  <span className="card-note">
                    {filter.approvedAt !== undefined && `approved ${timeInBusinessZone(filter.approvedAt)}`}
                    {filter.acknowledgedAt !== undefined &&
                      ` · created in Gmail ${timeInBusinessZone(filter.acknowledgedAt)}`}
                  </span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => {
                      remove(filter);
                    }}
                  >
                    {deleteLabel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
};
