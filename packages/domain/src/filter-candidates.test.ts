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

  it('proposes no candidate after only two confirmed archives from the same sender', () => {
    const decidedProposals = [
      confirmedArchive('message-1', 'sales'),
      confirmedArchive('message-2', 'system-update'),
    ];

    expect(filterCandidates(decidedProposals)).toEqual([]);
  });

  it('does not count rejected or corrected archive proposals toward the three a sender needs', () => {
    const decidedProposals = [
      confirmedArchive('message-1', 'sales'),
      confirmedArchive('message-2', 'system-update'),
      { ...confirmedArchive('message-3', 'sales'), verdict: { decision: 'rejected' } },
      {
        ...confirmedArchive('message-4', 'sales'),
        verdict: { decision: 'rejected', correction: { action: 'keep' } },
      },
    ];

    expect(filterCandidates(decidedProposals)).toEqual([]);
  });

  it('counts confirmed archives per sender, so only a sender with three of its own gets a candidate', () => {
    const fromOtherSender = (messageId: string) => ({
      ...confirmedArchive(messageId, 'sales'),
      from: 'alerts@other.example',
    });

    expect(
      filterCandidates([
        confirmedArchive('message-1', 'sales'),
        confirmedArchive('message-2', 'sales'),
        fromOtherSender('message-3'),
        fromOtherSender('message-4'),
      ]),
    ).toEqual([]);

    expect(
      filterCandidates([
        confirmedArchive('message-1', 'sales'),
        fromOtherSender('message-2'),
        confirmedArchive('message-3', 'sales'),
        confirmedArchive('message-4', 'sales'),
      ]),
    ).toEqual([
      {
        accountEmail: 'franciscoc@psmutuus.com',
        criteria: { from: 'news@vendor.example' },
        messageIds: ['message-1', 'message-3', 'message-4'],
      },
    ]);
  });

  it('proposes a candidate on the List-Id, not the sender, after three confirmed archives carrying that List-Id', () => {
    const onList = (messageId: string, from: string) => ({
      ...confirmedArchive(messageId, 'sales'),
      from,
      listId: 'announcements.vendor.example',
    });

    expect(
      filterCandidates([
        onList('message-1', 'ana@vendor.example'),
        onList('message-2', 'luis@vendor.example'),
        onList('message-3', 'marta@vendor.example'),
      ]),
    ).toEqual([
      {
        accountEmail: 'franciscoc@psmutuus.com',
        criteria: { listId: 'announcements.vendor.example' },
        messageIds: ['message-1', 'message-2', 'message-3'],
      },
    ]);
  });
  it('counts confirmed archives from the same sender per account, so two in each of two accounts yield no candidate', () => {
    const inOtherAccount = (messageId: string) => ({
      ...confirmedArchive(messageId, 'sales'),
      accountEmail: 'francisco@erlia.mx',
    });

    expect(
      filterCandidates([
        confirmedArchive('message-1', 'sales'),
        confirmedArchive('message-2', 'sales'),
        inOtherAccount('message-3'),
        inOtherAccount('message-4'),
      ]),
    ).toEqual([]);
  });
});
