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

  it('accepts criteria holding only from, or only listId, with the other criteria absent', () => {
    const onlyFrom = { criteria: { from: 'news@vendor.example' }, labelName: 'Newsletters/Vendor', skipInbox: true };
    const onlyListId = { criteria: { listId: 'digest.vendor.example' }, labelName: 'Newsletters/Vendor', skipInbox: false };

    expect(filterProposal.safeParse(onlyFrom)).toEqual({ success: true, data: onlyFrom });
    expect(filterProposal.safeParse(onlyListId)).toEqual({ success: true, data: onlyListId });
  });

  it('rejects a proposal with no criteria', () => {
    const noCriteria = { criteria: {}, labelName: 'Newsletters/Vendor', skipInbox: true };

    expect(filterProposal.safeParse(noCriteria).success).toBe(false);
  });
});
