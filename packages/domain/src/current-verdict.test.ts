import { describe, expect, it } from 'vitest';

import { currentVerdict } from './current-verdict';

describe('currentVerdict', () => {
  it('lets the later of two verdicts on a message decide its current state', () => {
    const firstVerdict = {
      messageId: 'message-1',
      decision: 'rejected',
      decidedAt: '2026-11-06T09:00:00-06:00',
    };
    const laterVerdict = {
      messageId: 'message-1',
      decision: 'confirmed',
      decidedAt: '2026-11-06T09:05:00-06:00',
    };
    expect(currentVerdict([firstVerdict, laterVerdict])).toEqual(laterVerdict);
  });

  it('lets the later verdict decide even when it is listed before the earlier one', () => {
    const laterVerdict = {
      messageId: 'message-1',
      decision: 'confirmed',
      decidedAt: '2026-11-06T09:05:00-06:00',
    };
    const earlierVerdict = {
      messageId: 'message-1',
      decision: 'rejected',
      decidedAt: '2026-11-06T09:00:00-06:00',
    };
    expect(currentVerdict([laterVerdict, earlierVerdict])).toEqual(laterVerdict);
  });
});
