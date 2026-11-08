import { describe, expect, it } from 'vitest';

import { importContactsOnce } from './contacts-import';

const peopleApi = 'https://people.googleapis.com/v1';

describe('importContactsOnce', () => {
  it("reads every page of the account's connections and posts one report with each contact's names, emails, organization, starred and labels", async () => {
    const connectionsRequests: URL[] = [];
    const backendPosts: { url: string; body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href.startsWith(`${peopleApi}/people/me/connections`)) {
        connectionsRequests.push(url);
        if (url.searchParams.get('pageToken') === 'page-2') {
          return Promise.resolve(
            Response.json({
              connections: [
                {
                  resourceName: 'people/c2',
                  names: [{ displayName: 'Luis Pérez' }],
                  emailAddresses: [{ value: 'luis@gmail.com' }],
                  memberships: [{ contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } }],
                },
              ],
            }),
          );
        }
        return Promise.resolve(
          Response.json({
            connections: [
              {
                resourceName: 'people/c1',
                names: [{ displayName: 'Ana Ruiz' }],
                emailAddresses: [{ value: 'ana@acme.com' }, { value: 'ana.ruiz@personal.mx' }],
                organizations: [{ name: 'Acme' }],
                memberships: [
                  { contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } },
                  { contactGroupMembership: { contactGroupResourceName: 'contactGroups/starred' } },
                  { contactGroupMembership: { contactGroupResourceName: 'contactGroups/1a2b3c' } },
                ],
              },
            ],
            nextPageToken: 'page-2',
          }),
        );
      }
      if (url.href.startsWith(`${peopleApi}/contactGroups`)) {
        return Promise.resolve(
          Response.json({
            contactGroups: [
              { resourceName: 'contactGroups/myContacts', name: 'myContacts', groupType: 'SYSTEM_CONTACT_GROUP' },
              { resourceName: 'contactGroups/starred', name: 'starred', groupType: 'SYSTEM_CONTACT_GROUP' },
              { resourceName: 'contactGroups/1a2b3c', name: 'Clients', groupType: 'USER_CONTACT_GROUP' },
            ],
          }),
        );
      }
      if (url.href.startsWith(`${peopleApi}/otherContacts`)) {
        return Promise.resolve(Response.json({ otherContacts: [] }));
      }
      if (url.href === 'http://127.0.0.1:7777/contacts-import' && init?.method === 'POST') {
        backendPosts.push({ url: url.href, body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await importContactsOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
    });

    expect(connectionsRequests).toHaveLength(2);
    expect(connectionsRequests[1]?.searchParams.get('pageToken')).toBe('page-2');
    expect(backendPosts).toEqual([
      {
        url: 'http://127.0.0.1:7777/contacts-import',
        body: {
          accountEmail: 'francisco@example.com',
          contacts: [
            {
              name: 'Ana Ruiz',
              emails: ['ana@acme.com', 'ana.ruiz@personal.mx'],
              organization: 'Acme',
              starred: true,
              lists: ['Clients'],
            },
            {
              name: 'Luis Pérez',
              emails: ['luis@gmail.com'],
              starred: false,
              lists: [],
            },
          ],
        },
      },
    ]);
  });

  it("reads every page of the account's Other Contacts and reports each one's name and emails as an unstarred contact without lists", async () => {
    const otherContactsRequests: URL[] = [];
    const backendPosts: { body: unknown }[] = [];
    const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.href.startsWith(`${peopleApi}/people/me/connections`)) {
        return Promise.resolve(Response.json({ connections: [] }));
      }
      if (url.href.startsWith(`${peopleApi}/contactGroups`)) {
        return Promise.resolve(Response.json({ contactGroups: [] }));
      }
      if (url.href.startsWith(`${peopleApi}/otherContacts`)) {
        otherContactsRequests.push(url);
        if (url.searchParams.get('pageToken') === 'other-2') {
          return Promise.resolve(
            Response.json({
              otherContacts: [
                {
                  resourceName: 'otherContacts/o2',
                  emailAddresses: [{ value: 'noreply@vendor.io' }],
                },
              ],
            }),
          );
        }
        return Promise.resolve(
          Response.json({
            otherContacts: [
              {
                resourceName: 'otherContacts/o1',
                names: [{ displayName: 'Marta Gil' }],
                emailAddresses: [{ value: 'marta@gil.mx' }, { value: 'marta.gil@work.com' }],
              },
            ],
            nextPageToken: 'other-2',
          }),
        );
      }
      if (url.href === 'http://127.0.0.1:7777/contacts-import' && init?.method === 'POST') {
        backendPosts.push({ body: JSON.parse(init.body as string) });
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(new Response('unexpected request', { status: 404 }));
    };

    await importContactsOnce({
      fetch: fakeFetch,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
    });

    expect(otherContactsRequests).toHaveLength(2);
    expect(otherContactsRequests[1]?.searchParams.get('pageToken')).toBe('other-2');
    expect(backendPosts).toEqual([
      {
        body: {
          accountEmail: 'francisco@example.com',
          contacts: [
            { name: 'Marta Gil', emails: ['marta@gil.mx', 'marta.gil@work.com'], starred: false, lists: [] },
            { emails: ['noreply@vendor.io'], starred: false, lists: [] },
          ],
        },
      },
    ]);
  });
});
