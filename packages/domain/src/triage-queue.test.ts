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
});
