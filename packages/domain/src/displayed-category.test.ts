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
});
