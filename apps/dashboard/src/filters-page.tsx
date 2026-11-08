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

export const approveLabel = 'Approve';

export const rejectLabel = 'Reject';

export const FiltersPage = () => {
  const [proposals, setProposals] = useState<FilterProposal[]>([]);

  useEffect(() => {
    void fetch('/filter-proposals')
      .then((response) => response.json() as Promise<FilterProposalsResponse>)
      .then((body) => {
        setProposals(body.proposals);
      });
  }, []);

  const decide = (proposal: FilterProposal, decision: 'approval' | 'rejection') => {
    void fetch(`/filter-proposals/${proposal.id}/${decision}`, { method: 'POST' });
  };

  return (
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
  );
};
