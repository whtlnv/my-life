import { useEffect, useState } from 'react';

import { accountName } from './account-name';

interface FilterDefinition {
  criteria: Record<string, string>;
  labelName: string;
  accountEmail: string;
}

interface FilterProposal extends FilterDefinition {
  id: string;
}

interface FilterProposalsResponse {
  proposals: FilterProposal[];
}

interface CreatedFilter extends FilterDefinition {
  gmailFilterId: string;
}

interface FiltersResponse {
  filters: CreatedFilter[];
}

export const approveLabel = 'Approve';

export const rejectLabel = 'Reject';

export const deleteLabel = 'Delete';

export const noFiltersText = 'No filter proposals or filters';

interface FilterSummaryProps {
  filter: FilterDefinition;
}

const FilterSummary = ({ filter }: FilterSummaryProps) => (
  <>
    {Object.values(filter.criteria).map((value) => (
      <span key={value}>{value}</span>
    ))}
    <span>{filter.labelName}</span>
    <span>{accountName(filter.accountEmail)}</span>
  </>
);

export const FiltersPage = () => {
  const [proposals, setProposals] = useState<FilterProposal[]>([]);
  const [filters, setFilters] = useState<CreatedFilter[]>([]);

  useEffect(() => {
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
  }, []);

  const decide = (proposal: FilterProposal, decision: 'approval' | 'rejection') => {
    void fetch(`/filter-proposals/${proposal.id}/${decision}`, { method: 'POST' });
  };

  return (
    <>
      {proposals.length === 0 && filters.length === 0 && <p className="empty">{noFiltersText}</p>}
      <ul aria-label="Filter proposals">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            <FilterSummary filter={proposal} />
            <button
              type="button"
              onClick={() => {
                decide(proposal, 'approval');
              }}
            >
              {approveLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                decide(proposal, 'rejection');
              }}
            >
              {rejectLabel}
            </button>
          </li>
        ))}
      </ul>
      <ul aria-label="Created filters">
        {filters.map((filter) => (
          <li key={filter.gmailFilterId}>
            <FilterSummary filter={filter} />
            <button
              type="button"
              onClick={() => {
                void fetch(`/filters/${filter.gmailFilterId}`, { method: 'DELETE' });
              }}
            >
              {deleteLabel}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
};
