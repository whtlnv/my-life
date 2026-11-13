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

  it('returns each item under the Action items heading, with its text', () => {
    const items = notesActionItems(fixture('gemini-notes-action-items.fixture.txt'));

    expect(items.map((item) => item.text)).toEqual([
      'Share the take-home exercise with the two new candidates.',
      'Update the job post with the remote-work policy.',
    ]);
  });

  it('stops at the heading that follows the next-steps section, so lines under a later heading are not items', () => {
    const items = notesActionItems(fixture('gemini-notes-later-heading.fixture.txt'));

    expect(items.map((item) => item.text)).toEqual([
      'Draft the first-quarter roadmap document for review.',
      'Confirm the reporting scope with the sales team.',
    ]);
  });

  it('yields no items for a notes doc with no next-steps heading', () => {
    const items = notesActionItems(fixture('gemini-notes-no-next-steps.fixture.txt'));

    expect(items).toEqual([]);
  });

  it('yields no items for empty text or a next-steps heading with nothing under it', () => {
    expect(notesActionItems('')).toEqual([]);
    expect(notesActionItems(fixture('gemini-notes-empty-next-steps.fixture.txt'))).toEqual([]);
  });

  it('reads an item written `[Name] does the thing` as the assignee Name and the text after the brackets', () => {
    const items = notesActionItems(fixture('gemini-notes-bracketed-assignee.fixture.txt'));

    expect(items).toEqual([{ assignee: 'Lucía Ferrer', text: 'Send the signed contract to the vendor.' }]);
  });
});
