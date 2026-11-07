import { describe, expect, it } from 'vitest';

import { displayedCategory } from './displayed-category';

describe('displayedCategory', () => {
  it('keeps an action proposal as action when the message is addressed to the user', () => {
    const proposal = { category: 'action' };
    const message = {
      to: 'Francisco <franciscoc@psmutuus.com>',
      cc: 'luis@example.com',
    };

    expect(displayedCategory(proposal, message, 'franciscoc@psmutuus.com')).toBe('action');
  });

  it('shows an action proposal as cc-thread when the user is only in Cc', () => {
    const proposal = { category: 'action' };
    const message = {
      to: 'luis@example.com',
      cc: 'Francisco <franciscoc@psmutuus.com>',
    };

    expect(displayedCategory(proposal, message, 'franciscoc@psmutuus.com')).toBe('cc-thread');
  });

  it('keeps a sales proposal as sales whether the message is addressed to the user or only copies them', () => {
    const proposal = { category: 'sales' };
    const addressed = { to: 'franciscoc@psmutuus.com', cc: '' };
    const copied = { to: 'luis@example.com', cc: 'franciscoc@psmutuus.com' };

    expect(displayedCategory(proposal, addressed, 'franciscoc@psmutuus.com')).toBe('sales');
    expect(displayedCategory(proposal, copied, 'franciscoc@psmutuus.com')).toBe('sales');
  });
});
