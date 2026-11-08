import type { ContactsImport } from '@my-life/contracts';
import type { AccountRequestOptions } from './fetch-function';

const peopleApi = 'https://people.googleapis.com/v1';
const starredGroup = 'contactGroups/starred';

interface GoogleConnection {
  names?: { displayName: string }[];
  emailAddresses?: { value: string }[];
  organizations?: { name: string }[];
  memberships?: { contactGroupMembership: { contactGroupResourceName: string } }[];
}

interface GoogleConnectionsResponse {
  connections: GoogleConnection[];
  nextPageToken?: string;
}

interface GoogleOtherContactsResponse {
  otherContacts: GoogleConnection[];
  nextPageToken?: string;
}

interface GoogleContactGroupsResponse {
  contactGroups: { resourceName: string; name: string; groupType: string }[];
}

async function fetchPeopleJson<ResponseBody>(options: AccountRequestOptions, url: URL): Promise<ResponseBody> {
  const response = await options.fetch(url, { headers: { Authorization: `Bearer ${options.accessToken}` } });
  return (await response.json()) as ResponseBody;
}

interface PeoplePage {
  items: GoogleConnection[];
  nextPageToken?: string | undefined;
}

async function fetchAllPages(
  path: string,
  query: Record<string, string>,
  fetchPage: (url: URL) => Promise<PeoplePage>,
): Promise<GoogleConnection[]> {
  const items: GoogleConnection[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${peopleApi}/${path}`);
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value);
    }
    if (pageToken !== undefined) {
      url.searchParams.set('pageToken', pageToken);
    }
    const page = await fetchPage(url);
    items.push(...page.items);
    pageToken = page.nextPageToken;
  } while (pageToken !== undefined);
  return items;
}

function fetchAllConnections(options: AccountRequestOptions): Promise<GoogleConnection[]> {
  return fetchAllPages(
    'people/me/connections',
    { personFields: 'names,emailAddresses,organizations,memberships' },
    async (url) => {
      const page = await fetchPeopleJson<GoogleConnectionsResponse>(options, url);
      return { items: page.connections, nextPageToken: page.nextPageToken };
    },
  );
}

function fetchAllOtherContacts(options: AccountRequestOptions): Promise<GoogleConnection[]> {
  return fetchAllPages('otherContacts', { readMask: 'names,emailAddresses' }, async (url) => {
    const page = await fetchPeopleJson<GoogleOtherContactsResponse>(options, url);
    return { items: page.otherContacts, nextPageToken: page.nextPageToken };
  });
}

async function fetchUserGroupNames(options: AccountRequestOptions): Promise<Map<string, string>> {
  const groups = await fetchPeopleJson<GoogleContactGroupsResponse>(options, new URL(`${peopleApi}/contactGroups`));
  return new Map(
    groups.contactGroups
      .filter((group) => group.groupType === 'USER_CONTACT_GROUP')
      .map((group) => [group.resourceName, group.name]),
  );
}

function toImportedContact(
  connection: GoogleConnection,
  userGroupNames: Map<string, string>,
): ContactsImport['contacts'][number] {
  const groupResourceNames = (connection.memberships ?? []).map(
    (membership) => membership.contactGroupMembership.contactGroupResourceName,
  );
  return {
    name: connection.names?.[0]?.displayName,
    emails: (connection.emailAddresses ?? []).map((email) => email.value),
    organization: connection.organizations?.[0]?.name,
    starred: groupResourceNames.includes(starredGroup),
    lists: groupResourceNames.flatMap((resourceName) => {
      const groupName = userGroupNames.get(resourceName);
      return groupName === undefined ? [] : [groupName];
    }),
  };
}

export async function importContactsOnce(options: AccountRequestOptions): Promise<void> {
  const userGroupNames = await fetchUserGroupNames(options);
  const connections = await fetchAllConnections(options);
  const otherContacts = await fetchAllOtherContacts(options);
  const contacts = [...connections, ...otherContacts].map((connection) =>
    toImportedContact(connection, userGroupNames),
  );
  await options.fetch(`${options.backendUrl}/contacts-import`, {
    method: 'POST',
    body: JSON.stringify({ accountEmail: options.accountEmail, contacts }),
  });
}
