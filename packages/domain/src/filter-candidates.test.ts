import { describe, expect, it } from 'vitest';

import { filterCandidates } from './filter-candidates';

const confirmedArchive = (messageId: string, category: string) => ({
  messageId,
  accountEmail: 'franciscoc@psmutuus.com',
  from: 'news@vendor.example',
  category,
  action: 'archive',
  verdict: { decision: 'confirmed' },
});

describe('filterCandidates', () => {
  it('proposes a candidate on the sender for its account after the third confirmed archive from that sender', () => {
    const decidedProposals = [
      confirmedArchive('message-1', 'sales'),
      confirmedArchive('message-2', 'system-update'),
      confirmedArchive('message-3', 'unknown'),
    ];

    expect(filterCandidates(decidedProposals)).toEqual([
      {
        accountEmail: 'franciscoc@psmutuus.com',
        criteria: { from: 'news@vendor.example' },
        messageIds: ['message-1', 'message-2', 'message-3'],
      },
    ]);
  });
});
