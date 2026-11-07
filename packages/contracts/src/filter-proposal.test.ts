import { describe, expect, it } from 'vitest';

import { filterProposal } from './filter-proposal';

describe('filterProposal', () => {
  it('accepts criteria with from, subject and listId, a label name and skipInbox', () => {
    const proposal = {
      criteria: { from: 'news@vendor.example', subject: 'Weekly digest', listId: 'digest.vendor.example' },
      labelName: 'Newsletters/Vendor',
      skipInbox: true,
    };

    expect(filterProposal.parse(proposal)).toEqual(proposal);
  });
});
