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
});
