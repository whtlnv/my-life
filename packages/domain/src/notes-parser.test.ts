import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { notesActionItems } from './notes-parser';

const fixture = (name: string): string => readFileSync(path.join(import.meta.dirname, name), 'utf8');

describe('notesActionItems', () => {
  it.each([
    {
      behavior: 'returns each item under the Suggested next steps heading, with its text',
      fixtureName: 'gemini-notes-suggested-next-steps.fixture.txt',
      texts: [
        'Send the revised budget to the finance team by Friday.',
        'Ask the vendor for the new pricing sheet.',
        'Book a follow-up review for the first week of December.',
      ],
    },
    {
      behavior: 'returns each item under the Action items heading, with its text',
      fixtureName: 'gemini-notes-action-items.fixture.txt',
      texts: [
        'Share the take-home exercise with the two new candidates.',
        'Update the job post with the remote-work policy.',
      ],
    },
    {
      behavior:
        'stops at the heading that follows the next-steps section, so lines under a later heading are not items',
      fixtureName: 'gemini-notes-later-heading.fixture.txt',
      texts: [
        'Draft the first-quarter roadmap document for review.',
        'Confirm the reporting scope with the sales team.',
      ],
    },
    {
      behavior: 'yields no items for a notes doc with no next-steps heading',
      fixtureName: 'gemini-notes-no-next-steps.fixture.txt',
      texts: [],
    },
  ])('$behavior', ({ fixtureName, texts }) => {
    const items = notesActionItems(fixture(fixtureName));

    expect(items.map((item) => item.text)).toEqual(texts);
  });

  it('yields no items for empty text or a next-steps heading with nothing under it', () => {
    expect(notesActionItems('')).toEqual([]);
    expect(notesActionItems(fixture('gemini-notes-empty-next-steps.fixture.txt'))).toEqual([]);
  });

  it('reads an item written `[Name] does the thing` as the assignee Name and the text after the brackets', () => {
    const items = notesActionItems(fixture('gemini-notes-bracketed-assignee.fixture.txt'));

    expect(items).toEqual([{ assignee: 'Lucía Ferrer', text: 'Send the signed contract to the vendor.' }]);
  });

  it('reads an item written `Name will do the thing` as carrying the assignee Name', () => {
    const items = notesActionItems(fixture('gemini-notes-will-assignee.fixture.txt'));

    expect(items.map((item) => item.assignee)).toEqual(['Tomás Ibarra']);
  });

  it('gives no assignee to an item that names no one, even when it contains the word will', () => {
    const items = notesActionItems(fixture('gemini-notes-unassigned.fixture.txt'));

    expect(items.map((item) => item.assignee)).toEqual([undefined]);
  });
});
