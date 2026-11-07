import { describe, expect, it } from 'vitest';

import { triageProposal } from './triage-proposal';

describe('triageProposal', () => {
  it('accepts an archive proposal for a cc-thread with a summary, the category extract and a reason', () => {
    const proposal = {
      action: 'archive',
      category: 'cc-thread',
      summary: 'Luis confirmed the vendor contract is signed',
      extract: { sinceLastMessage: 'Luis confirmed the vendor signed the contract on Thursday.' },
      reason: 'The user is only in Cc and nothing is asked of them.',
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });
});
