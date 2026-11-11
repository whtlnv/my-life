// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const fixtureDocument = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(new URL(fileName, import.meta.url), 'utf8'), 'text/html');

const senderOf = (row: Element): string =>
  /^\[[^\]]+\] (.+): $/.exec(row.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '')?.[1] ?? '';

const isSentByUser = (row: Element): boolean =>
  row.querySelector('[data-testid="msg-meta"] span[aria-label]') !== null;

const renderedRows = (document: Document): Element[] =>
  [...document.querySelectorAll('#main [data-id]')].filter((row) => row.querySelector('[data-testid="msg-container"]'));

describe('WhatsApp fixtures', () => {
  it('hold a chat list and a one-to-one chat with one other sender, and a group chat with several senders and the user’s own messages', () => {
    const oneToOne = fixtureDocument('whatsapp-one-to-one-chat.fixture.html');
    const group = fixtureDocument('whatsapp-group-chat.fixture.html');

    for (const document of [oneToOne, group]) {
      expect(document.querySelectorAll('#pane-side [data-testid="cell-frame-title"] span[title]').length).toBeGreaterThan(1);
    }
    const oneToOneSenders = new Set(renderedRows(oneToOne).filter((row) => !isSentByUser(row)).map(senderOf).filter(Boolean));
    const groupSenders = new Set(renderedRows(group).filter((row) => !isSentByUser(row)).map(senderOf).filter(Boolean));
    expect(oneToOneSenders.size).toBe(1);
    expect(groupSenders.size).toBeGreaterThan(1);
    expect(renderedRows(group).some(isSentByUser)).toBe(true);
  });
});
