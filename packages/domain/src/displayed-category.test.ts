import { describe, expect, it } from 'vitest';

import { displayedCategory } from './displayed-category';

describe('displayedCategory', () => {
  it.each([
    {
      rule: 'keeps an action proposal as action when the message is addressed to the user',
      category: 'action',
      message: { to: 'Francisco <franciscoc@psmutuus.com>', cc: 'luis@example.com' },
      displayed: 'action',
    },
    {
      rule: 'shows an action proposal as cc-thread when the user is only in Cc',
      category: 'action',
      message: { to: 'luis@example.com', cc: 'Francisco <franciscoc@psmutuus.com>' },
      displayed: 'cc-thread',
    },
    {
      rule: 'keeps a sales proposal as sales when the message is addressed to the user',
      category: 'sales',
      message: { to: 'franciscoc@psmutuus.com', cc: '' },
      displayed: 'sales',
    },
    {
      rule: 'keeps a sales proposal as sales when the message only copies the user',
      category: 'sales',
      message: { to: 'luis@example.com', cc: 'franciscoc@psmutuus.com' },
      displayed: 'sales',
    },
  ])('$rule', ({ category, message, displayed }) => {
    expect(displayedCategory({ category }, message, 'franciscoc@psmutuus.com')).toBe(displayed);
  });
});
