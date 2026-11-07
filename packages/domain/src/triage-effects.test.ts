import { describe, expect, it } from 'vitest';

import { triageEffects } from './triage-effects';

describe('triageEffects', () => {
  it('produces no archive for an archive proposal with no verdict', () => {
    const proposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
    };

    expect(triageEffects(proposal, undefined).archives).toEqual([]);
  });

  it('produces an archive of the message on its account for an archive proposal the user confirmed', () => {
    const proposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
    };

    expect(triageEffects(proposal, { decision: 'confirmed' }).archives).toEqual([
      { messageId: 'message-1', accountEmail: 'franciscoc@psmutuus.com' },
    ]);
  });
});
