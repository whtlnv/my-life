// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const fixtureDocument = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(new URL(fileName, import.meta.url), 'utf8'), 'text/html');

const senderOf = (row: Element): string => {
  const prePlainText = row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '';
  return /^\[[^\]]+\] (.+): $/.exec(prePlainText)?.[1] ?? '';
};

const isSentByUser = (row: Element): boolean => row.querySelector('[data-testid="msg-meta"] span[aria-label]') !== null;

const renderedRows = (document: Document): Element[] =>
  [...document.querySelectorAll('#main [data-id]')].filter((row) => row.querySelector('[data-testid="msg-container"]'));

const chatListTitles = (document: Document): NodeListOf<Element> =>
  document.querySelectorAll('#pane-side [data-testid="cell-frame-title"] span[title]');

const otherSenders = (document: Document): Set<string> =>
  new Set(
    renderedRows(document)
      .filter((row) => !isSentByUser(row))
      .map(senderOf)
      .filter(Boolean),
  );

describe('WhatsApp fixtures', () => {
  it('hold a chat list and a one-to-one chat with one other sender, and a group chat with several senders and the user’s own messages', () => {
    const oneToOne = fixtureDocument('whatsapp-one-to-one-chat.fixture.html');
    const group = fixtureDocument('whatsapp-group-chat.fixture.html');

    for (const document of [oneToOne, group]) {
      expect(chatListTitles(document).length).toBeGreaterThan(1);
    }
    expect(otherSenders(oneToOne).size).toBe(1);
    expect(otherSenders(group).size).toBeGreaterThan(1);
    expect(renderedRows(group).some(isSentByUser)).toBe(true);
  });
});
