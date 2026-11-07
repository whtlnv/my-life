import { describe, expect, it } from 'vitest';

import { triageQueue } from './triage-queue';

describe('triageQueue', () => {
  it('lists a message that has a proposal and no verdict as waiting', () => {
    const proposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'cc-thread',
    };
    expect(triageQueue([proposal], []).waiting).toEqual([proposal]);
  });

  it('no longer lists a message as waiting once it has a verdict', () => {
    const decidedProposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'cc-thread',
    };
    const undecidedProposal = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'keep',
      category: 'action',
    };
    const verdict = {
      messageId: 'message-1',
      decision: 'confirmed',
      decidedAt: '2026-11-06T09:00:00-06:00',
    };
    expect(triageQueue([decidedProposal, undecidedProposal], [verdict]).waiting).toEqual([
      undecidedProposal,
    ]);
  });

  it('groups the waiting proposals by category', () => {
    const firstSalesProposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'keep',
      category: 'sales',
    };
    const expenseProposal = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'expense',
    };
    const secondSalesProposal = {
      messageId: 'message-3',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'sales',
    };
    const { groups } = triageQueue([firstSalesProposal, expenseProposal, secondSalesProposal], []);
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual({ category: 'sales', proposals: [firstSalesProposal, secondSalesProposal] });
    expect(groups).toContainEqual({ category: 'expense', proposals: [expenseProposal] });
  });

  it('groups the waiting system-update proposals within their category by sending system', () => {
    const firstSentryProposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'Sentry', severity: 'error', significant: true },
    };
    const awsProposal = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'AWS', severity: 'info', significant: false },
    };
    const secondSentryProposal = {
      messageId: 'message-3',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'Sentry', severity: 'warning', significant: false },
    };
    const { groups } = triageQueue([firstSentryProposal, awsProposal, secondSentryProposal], []);
    const systemUpdateGroup = groups.find((group) => group.category === 'system-update');
    expect(systemUpdateGroup?.systems).toHaveLength(2);
    expect(systemUpdateGroup?.systems).toContainEqual({
      system: 'Sentry',
      proposals: [firstSentryProposal, secondSentryProposal],
    });
    expect(systemUpdateGroup?.systems).toContainEqual({ system: 'AWS', proposals: [awsProposal] });
  });
});
