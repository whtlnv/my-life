import { describe, expect, it } from 'vitest';

import { triageEffects } from './triage-effects';

const archiveProposal = {
  messageId: 'message-1',
  accountEmail: 'franciscoc@psmutuus.com',
  action: 'archive',
};

describe('triageEffects', () => {
  it('produces no archive for an archive proposal with no verdict', () => {
    expect(triageEffects(archiveProposal, undefined).archives).toEqual([]);
  });

  it('produces an archive of the message on its account for an archive proposal the user confirmed', () => {
    expect(triageEffects(archiveProposal, { decision: 'confirmed' }).archives).toEqual([
      { messageId: 'message-1', accountEmail: 'franciscoc@psmutuus.com' },
    ]);
  });

  it('produces no archive for an archive proposal the user rejected', () => {
    expect(triageEffects(archiveProposal, { decision: 'rejected' }).archives).toEqual([]);
  });

  it('produces no archive for a keep proposal the user confirmed', () => {
    const keepProposal = { ...archiveProposal, action: 'keep' };
    expect(triageEffects(keepProposal, { decision: 'confirmed' }).archives).toEqual([]);
  });
});
