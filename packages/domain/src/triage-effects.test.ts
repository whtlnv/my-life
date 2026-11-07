import { describe, expect, it } from 'vitest';

import { triageEffects } from './triage-effects';

const archiveProposal = {
  messageId: 'message-1',
  accountEmail: 'franciscoc@psmutuus.com',
  action: 'archive',
};

describe('triageEffects', () => {
  it.each([
    { rule: 'an archive proposal with no verdict', proposal: archiveProposal, verdict: undefined },
    { rule: 'an archive proposal the user rejected', proposal: archiveProposal, verdict: { decision: 'rejected' } },
    {
      rule: 'a keep proposal the user confirmed',
      proposal: { ...archiveProposal, action: 'keep' },
      verdict: { decision: 'confirmed' },
    },
  ])('produces no archive for $rule', ({ proposal, verdict }) => {
    expect(triageEffects(proposal, verdict).archives).toEqual([]);
  });

  it('produces an archive of the message on its account for an archive proposal the user confirmed', () => {
    expect(triageEffects(archiveProposal, { decision: 'confirmed' }).archives).toEqual([
      { messageId: 'message-1', accountEmail: 'franciscoc@psmutuus.com' },
    ]);
  });

  it('produces a task from the correction for a proposal the user rejected and corrected to act', () => {
    const verdict = {
      decision: 'rejected',
      correction: { action: 'act', taskDraft: { title: 'Send the signed contract to Ana' } },
    };
    expect(triageEffects(archiveProposal, verdict).tasks).toEqual([
      {
        title: 'Send the signed contract to Ana',
        messageId: 'message-1',
        accountEmail: 'franciscoc@psmutuus.com',
      },
    ]);
  });

  it('produces a task with the draft title, the message and its account for an act proposal the user confirmed', () => {
    const actProposal = {
      ...archiveProposal,
      action: 'act',
      taskDraft: { title: 'Review the quarterly budget' },
    };
    expect(triageEffects(actProposal, { decision: 'confirmed' }).tasks).toEqual([
      {
        title: 'Review the quarterly budget',
        messageId: 'message-1',
        accountEmail: 'franciscoc@psmutuus.com',
      },
    ]);
  });

  it('produces an archive and no task for a keep proposal the user rejected and corrected to archive', () => {
    const keepProposal = { ...archiveProposal, action: 'keep' };
    const verdict = { decision: 'rejected', correction: { action: 'archive' } };
    expect(triageEffects(keepProposal, verdict)).toEqual({
      archives: [{ messageId: 'message-1', accountEmail: 'franciscoc@psmutuus.com' }],
      tasks: [],
    });
  });

  it('produces no task and no archive for an act proposal the user rejected without a correction', () => {
    const actProposal = {
      ...archiveProposal,
      action: 'act',
      taskDraft: { title: 'Review the quarterly budget' },
    };
    expect(triageEffects(actProposal, { decision: 'rejected' })).toEqual({
      archives: [],
      tasks: [],
    });
  });

  it('puts the company on the check-later list for a sales keep proposal the user confirmed', () => {
    const salesKeepProposal = {
      ...archiveProposal,
      action: 'keep',
      category: 'sales',
      extract: { company: 'Acme', solution: 'AI scheduling assistant', problem: 'Time lost coordinating meetings' },
    };
    expect(triageEffects(salesKeepProposal, { decision: 'confirmed' }).checkLater).toEqual([
      { company: 'Acme', messageId: 'message-1', accountEmail: 'franciscoc@psmutuus.com' },
    ]);
  });

  it.each([
    {
      rule: 'a keep proposal of another category the user confirmed',
      proposal: { ...archiveProposal, action: 'keep', category: 'expense', extract: { company: 'Acme' } },
      verdict: { decision: 'confirmed' },
      effects: { archives: [], tasks: [] },
    },
    {
      rule: 'a sales keep proposal the user rejected',
      proposal: { ...archiveProposal, action: 'keep', category: 'sales', extract: { company: 'Acme' } },
      verdict: { decision: 'rejected' },
      effects: { archives: [], tasks: [] },
    },
    {
      rule: 'a sales archive proposal the user confirmed',
      proposal: { ...archiveProposal, category: 'sales', extract: { company: 'Acme' } },
      verdict: { decision: 'confirmed' },
      effects: { archives: [{ messageId: 'message-1', accountEmail: 'franciscoc@psmutuus.com' }], tasks: [] },
    },
  ])('puts nothing on the check-later list for $rule', ({ proposal, verdict, effects }) => {
    expect(triageEffects(proposal, verdict)).toEqual(effects);
  });
});
