import { useEffect, useState } from 'react';

import { accountName } from './account-name';

interface FilterProposal {
  id: string;
  criteria: Record<string, string>;
  labelName: string;
  accountEmail: string;
}

interface FilterProposalsResponse {
  proposals: FilterProposal[];
}

interface CreatedFilter {
  gmailFilterId: string;
  criteria: Record<string, string>;
  labelName: string;
  accountEmail: string;
}

interface FiltersResponse {
  filters: CreatedFilter[];
}

export const approveLabel = 'Approve';

export const rejectLabel = 'Reject';

export const deleteLabel = 'Delete';

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
      <ul aria-label="Filter proposals">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            {Object.values(proposal.criteria).map((value) => (
              <span key={value}>{value}</span>
            ))}
            <span>{proposal.labelName}</span>
            <span>{accountName(proposal.accountEmail)}</span>
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
            {Object.values(filter.criteria).map((value) => (
              <span key={value}>{value}</span>
            ))}
            <span>{filter.labelName}</span>
            <span>{accountName(filter.accountEmail)}</span>
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
