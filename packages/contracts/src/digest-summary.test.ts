import { describe, expect, it } from 'vitest';

import { digestSummary } from './digest-summary';

describe('digestSummary', () => {
  it.each([
    { rule: 'accepts one line', lines: ['GitHub: 2 builds passed'], accepted: true },
    { rule: 'accepts two lines', lines: ['GitHub: 2 builds passed', 'Vercel: 1 deploy failed'], accepted: true },
    { rule: 'refuses no lines', lines: [], accepted: false },
    { rule: 'refuses three lines', lines: ['GitHub', 'Vercel', 'Sentry'], accepted: false },
    { rule: 'refuses an empty line', lines: [''], accepted: false },
  ])('$rule', ({ lines, accepted }) => {
    expect(digestSummary.safeParse({ lines }).success).toBe(accepted);
  });
});
