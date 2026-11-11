// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { FetchFunction } from './fetch-function';
import { carryOutWhatsappSends } from './whatsapp-send';

const backendUrl = 'http://127.0.0.1:7777';

const fixtureDocument = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(new URL(fileName, import.meta.url), 'utf8'), 'text/html');

// Records, in order, what the page saw: a chat row clicked, the composer's text when Enter was pressed in it.
function recordPageActions(document: Document, actions: string[]) {
  document.addEventListener('click', (event) => {
    const row = (event.target as Element).closest('[role="row"]');
    const title = row?.querySelector('[data-testid="cell-frame-title"] span[title]')?.getAttribute('title');
    if (title) actions.push(`select ${title}`);
  });
  const composer = document.querySelector('[data-testid="conversation-compose-box-input"]');
  composer?.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') actions.push(`send ${composer.textContent}`);
  });
}

const onMyWayCommand = {
  id: 'send-whatsapp-1',
  type: 'send-whatsapp',
  chatTitle: 'aaaaaaaaa aaaaaaa',
  text: 'On my way',
};

function fakeBackend(actions: string[], commands: object[]): FetchFunction {
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (
      url.origin + url.pathname === `${backendUrl}/commands` &&
      url.searchParams.get('accountEmail') === 'francisco@example.com'
    ) {
      return Promise.resolve(Response.json({ commands }));
    }
    const acknowledgementPath = /^\/commands\/([^/]+)\/acknowledgement$/.exec(url.pathname);
    if (url.origin === backendUrl && acknowledgementPath !== null && init?.method === 'POST') {
      actions.push(`acknowledge ${acknowledgementPath[1] ?? ''}`);
      return Promise.resolve(new Response(null, { status: 200 }));
    }
    return Promise.resolve(new Response('unexpected request', { status: 404 }));
  };
}

async function carryOutSendsOnFixture(commands: object[]) {
  const document = fixtureDocument('whatsapp-one-to-one-chat.fixture.html');
  const actions: string[] = [];
  recordPageActions(document, actions);
  await carryOutWhatsappSends({
    fetch: fakeBackend(actions, commands),
    accountEmail: 'francisco@example.com',
    backendUrl,
    document,
  });
  return actions;
}

describe('carryOutWhatsappSends', () => {
  it('selects the chat with the command title, types the text into the composer, presses send and acknowledges the command', async () => {
    const actions = await carryOutSendsOnFixture([onMyWayCommand]);

    expect(actions).toEqual(['select aaaaaaaaa aaaaaaa', 'send On my way', 'acknowledge send-whatsapp-1']);
  });

  it('types nothing and does not acknowledge a command whose chat title is not in the chat list', async () => {
    const actions = await carryOutSendsOnFixture([{ ...onMyWayCommand, chatTitle: 'Nobody In This List' }]);

    expect(actions).toEqual([]);
  });
});
