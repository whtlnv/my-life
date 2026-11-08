import { describe, expect, it } from 'vitest';

import { createApp } from '@my-life/backend/app';
import { importContactsOnce } from '@my-life/extension/contacts-import';

import { startPeopleFakeServer } from './people-fake-server';

const accountEmail = 'ana@example.com';
const backendUrl = 'http://backend.test';

type Backend = ReturnType<typeof createApp>;

function extensionFetchRoutingTo(peopleUrl: string, backend: Backend): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin === 'https://people.googleapis.com') {
      return fetch(new URL(url.pathname + url.search, peopleUrl), init);
    }
    return backend.request(url.pathname + url.search, init);
  };
}

describe('People fake server', () => {
  it('importing the starred-client-and-other-contact scenario lists at GET /contacts the starred client as vip with its organization and list, and the other contact by name and email', async () => {
    const backend = createApp({ allowedEmails: [accountEmail] });
    const people = await startPeopleFakeServer('starred-client-and-other-contact');
    try {
      await importContactsOnce({
        fetch: extensionFetchRoutingTo(people.url, backend),
        accessToken: 'fake-token',
        accountEmail,
        backendUrl,
      });
    } finally {
      await people.close();
    }

    const { contacts } = (await (await backend.request('/contacts')).json()) as {
      contacts: { displayName: string; emails: string[]; organization?: string; marks: string[]; lists?: string[] }[];
    };

    expect(contacts).toHaveLength(2);
    expect(contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'Ana Ruiz',
          emails: ['ana@acme.com'],
          organization: 'Acme',
          marks: ['vip'],
          lists: ['Clients'],
        }),
        expect.objectContaining({ displayName: 'Luis Pérez', emails: ['luis@gmail.com'], marks: [] }),
      ]),
    );
  });
});
