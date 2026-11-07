import { describe, expect, it } from 'vitest';

import { chooseVerdictExamples } from './verdict-examples';

describe('chooseVerdictExamples', () => {
  it('chooses the most recent verdicts from the same sender, newest first', () => {
    const oldestFromSender = {
      messageId: 'message-1',
      from: 'ana@proveedor.mx',
      category: 'expense',
      decision: 'confirmed',
      decidedAt: '2026-11-01T09:00:00-06:00',
    };
    const newestFromSender = {
      messageId: 'message-2',
      from: 'ana@proveedor.mx',
      category: 'expense',
      decision: 'confirmed',
      decidedAt: '2026-11-05T09:00:00-06:00',
    };
    const middleFromSender = {
      messageId: 'message-3',
      from: 'ana@proveedor.mx',
      category: 'sales',
      decision: 'rejected',
      decidedAt: '2026-11-03T09:00:00-06:00',
    };
    const fromAnotherSender = {
      messageId: 'message-4',
      from: 'luis@otra.mx',
      category: 'system-update',
      decision: 'confirmed',
      decidedAt: '2026-11-06T08:00:00-06:00',
    };

    const examples = chooseVerdictExamples(
      { from: 'ana@proveedor.mx' },
      [oldestFromSender, newestFromSender, middleFromSender, fromAnotherSender],
      2,
    );

    expect(examples).toEqual([newestFromSender, middleFromSender]);
  });
});
