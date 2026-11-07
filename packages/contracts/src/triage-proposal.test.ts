import { describe, expect, it } from 'vitest';

import { triageProposal } from './triage-proposal';

const archiveCcThreadProposal = {
  action: 'archive',
  category: 'cc-thread',
  summary: 'Luis confirmed the vendor contract is signed',
  extract: { sinceLastMessage: 'Luis confirmed the vendor signed the contract on Thursday.' },
  reason: 'The user is only in Cc and nothing is asked of them.',
};

describe('triageProposal', () => {
  it('accepts an archive proposal for a cc-thread with a summary, the category extract and a reason', () => {
    expect(triageProposal.parse(archiveCcThreadProposal)).toEqual(archiveCcThreadProposal);
  });

  it('rejects a proposal whose category is not one of the seven categories', () => {
    const proposal = { ...archiveCcThreadProposal, category: 'newsletter' };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('rejects a proposal whose action is not archive, keep or act', () => {
    const proposal = { ...archiveCcThreadProposal, action: 'snooze' };

    expect(triageProposal.safeParse(proposal).success).toBe(false);
  });

  it('accepts an act proposal carrying a task draft with a title', () => {
    const proposal = {
      ...archiveCcThreadProposal,
      action: 'act',
      taskDraft: { title: 'Send Luis the signed vendor contract for filing' },
    };

    expect(triageProposal.parse(proposal)).toEqual(proposal);
  });
});
