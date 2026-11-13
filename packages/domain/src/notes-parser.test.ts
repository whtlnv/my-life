import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { notesActionItems } from './notes-parser';

const fixture = (name: string): string => readFileSync(path.join(import.meta.dirname, name), 'utf8');

describe('notesActionItems', () => {
  it('returns each item under the Suggested next steps heading, with its text', () => {
    const items = notesActionItems(fixture('gemini-notes-suggested-next-steps.fixture.txt'));

    expect(items.map((item) => item.text)).toEqual([
      'Send the revised budget to the finance team by Friday.',
      'Ask the vendor for the new pricing sheet.',
      'Book a follow-up review for the first week of December.',
    ]);
  });
});
