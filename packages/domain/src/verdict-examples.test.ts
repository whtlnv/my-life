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

  it('fills the remaining examples with the most recent verdicts of the same category when the sender has too few', () => {
    const newestFromSender = {
      messageId: 'message-1',
      from: 'ana@proveedor.mx',
      category: 'expense',
      decision: 'confirmed',
      decidedAt: '2026-11-04T09:00:00-06:00',
    };
    const olderFromSender = {
      messageId: 'message-2',
      from: 'ana@proveedor.mx',
      category: 'sales',
      decision: 'rejected',
      decidedAt: '2026-11-02T09:00:00-06:00',
    };
    const olderOfSameCategory = {
      messageId: 'message-3',
      from: 'luis@otra.mx',
      category: 'expense',
      decision: 'confirmed',
      decidedAt: '2026-11-01T09:00:00-06:00',
    };
    const newestOfSameCategory = {
      messageId: 'message-4',
      from: 'marta@tienda.mx',
      category: 'expense',
      decision: 'confirmed',
      decidedAt: '2026-11-05T09:00:00-06:00',
    };

    const examples = chooseVerdictExamples(
      { from: 'ana@proveedor.mx', category: 'expense' },
      [olderOfSameCategory, newestFromSender, newestOfSameCategory, olderFromSender],
      3,
    );

    expect(examples).toEqual([newestFromSender, olderFromSender, newestOfSameCategory]);
  });

  it('never chooses a verdict from another sender in another category', () => {
    const fromSender = {
      messageId: 'message-1',
      from: 'ana@proveedor.mx',
      category: 'sales',
      decision: 'confirmed',
      decidedAt: '2026-11-02T09:00:00-06:00',
    };
    const ofSameCategory = {
      messageId: 'message-2',
      from: 'luis@otra.mx',
      category: 'expense',
      decision: 'confirmed',
      decidedAt: '2026-11-03T09:00:00-06:00',
    };
    const fromAnotherSenderInAnotherCategory = {
      messageId: 'message-3',
      from: 'marta@tienda.mx',
      category: 'system-update',
      decision: 'confirmed',
      decidedAt: '2026-11-06T09:00:00-06:00',
    };

    const examples = chooseVerdictExamples(
      { from: 'ana@proveedor.mx', category: 'expense' },
      [fromAnotherSenderInAnotherCategory, ofSameCategory, fromSender],
      5,
    );

    expect(examples).toEqual([fromSender, ofSameCategory]);
  });

  it('chooses at most the limit of examples even when sender and category verdicts together exceed it', () => {
    const newestFromSender = {
      messageId: 'message-1',
      from: 'ana@proveedor.mx',
      category: 'expense',
      decision: 'confirmed',
      decidedAt: '2026-11-05T09:00:00-06:00',
    };
    const olderFromSender = {
      messageId: 'message-2',
      from: 'ana@proveedor.mx',
      category: 'sales',
      decision: 'rejected',
      decidedAt: '2026-11-03T09:00:00-06:00',
    };
    const newestOfSameCategory = {
      messageId: 'message-3',
      from: 'luis@otra.mx',
      category: 'expense',
      decision: 'confirmed',
      decidedAt: '2026-11-04T09:00:00-06:00',
    };
    const olderOfSameCategory = {
      messageId: 'message-4',
      from: 'marta@tienda.mx',
      category: 'expense',
      decision: 'confirmed',
      decidedAt: '2026-11-01T09:00:00-06:00',
    };

    const examples = chooseVerdictExamples(
      { from: 'ana@proveedor.mx', category: 'expense' },
      [olderOfSameCategory, newestOfSameCategory, olderFromSender, newestFromSender],
      3,
    );

    expect(examples).toEqual([newestFromSender, olderFromSender, newestOfSameCategory]);
  });
});
