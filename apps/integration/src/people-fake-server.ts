import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

type PeopleScenario = 'starred-client-and-other-contact';

const scenarios: Record<PeopleScenario, { contactGroups: unknown; connections: unknown; otherContacts: unknown }> = {
  'starred-client-and-other-contact': {
    contactGroups: {
      contactGroups: [
        { resourceName: 'contactGroups/myContacts', name: 'myContacts', groupType: 'SYSTEM_CONTACT_GROUP' },
        { resourceName: 'contactGroups/starred', name: 'starred', groupType: 'SYSTEM_CONTACT_GROUP' },
        { resourceName: 'contactGroups/1a2b3c', name: 'Clients', groupType: 'USER_CONTACT_GROUP' },
      ],
    },
    connections: {
      connections: [
        {
          resourceName: 'people/c1',
          names: [{ displayName: 'Ana Ruiz' }],
          emailAddresses: [{ value: 'ana@acme.com' }],
          organizations: [{ name: 'Acme' }],
          memberships: [
            { contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } },
            { contactGroupMembership: { contactGroupResourceName: 'contactGroups/starred' } },
            { contactGroupMembership: { contactGroupResourceName: 'contactGroups/1a2b3c' } },
          ],
        },
      ],
    },
    otherContacts: {
      otherContacts: [
        {
          resourceName: 'otherContacts/o1',
          names: [{ displayName: 'Luis Pérez' }],
          emailAddresses: [{ value: 'luis@gmail.com' }],
        },
      ],
    },
  },
};

export async function startPeopleFakeServer(scenario: PeopleScenario) {
  const { contactGroups, connections, otherContacts } = scenarios[scenario];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fake').pathname;
    const body =
      path === '/v1/contactGroups' ? contactGroups : path === '/v1/otherContacts' ? otherContacts : connections;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  };
}
