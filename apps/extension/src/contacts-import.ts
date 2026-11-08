import type { FetchFunction } from './fetch-function';

const peopleApi = 'https://people.googleapis.com/v1';
const starredGroup = 'contactGroups/starred';

interface ImportContactsOptions {
  fetch: FetchFunction;
  accessToken: string;
  accountEmail: string;
  backendUrl: string;
}

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

interface GoogleContactGroupsResponse {
  contactGroups: { resourceName: string; name: string; groupType: string }[];
}

async function fetchPeopleJson<ResponseBody>(options: ImportContactsOptions, url: URL): Promise<ResponseBody> {
  const response = await options.fetch(url, { headers: { Authorization: `Bearer ${options.accessToken}` } });
  return (await response.json()) as ResponseBody;
}

async function fetchAllConnections(options: ImportContactsOptions): Promise<GoogleConnection[]> {
  const connections: GoogleConnection[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${peopleApi}/people/me/connections`);
    url.searchParams.set('personFields', 'names,emailAddresses,organizations,memberships');
    if (pageToken !== undefined) {
      url.searchParams.set('pageToken', pageToken);
    }
    const page = await fetchPeopleJson<GoogleConnectionsResponse>(options, url);
    connections.push(...page.connections);
    pageToken = page.nextPageToken;
  } while (pageToken !== undefined);
  return connections;
}

async function fetchUserGroupNames(options: ImportContactsOptions): Promise<Map<string, string>> {
  const groups = await fetchPeopleJson<GoogleContactGroupsResponse>(options, new URL(`${peopleApi}/contactGroups`));
  return new Map(
    groups.contactGroups
      .filter((group) => group.groupType === 'USER_CONTACT_GROUP')
      .map((group) => [group.resourceName, group.name]),
  );
}

function toImportedContact(connection: GoogleConnection, userGroupNames: Map<string, string>) {
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

export async function importContactsOnce(options: ImportContactsOptions): Promise<void> {
  const userGroupNames = await fetchUserGroupNames(options);
  const connections = await fetchAllConnections(options);
  const contacts = connections.map((connection) => toImportedContact(connection, userGroupNames));
  await options.fetch(`${options.backendUrl}/contacts-import`, {
    method: 'POST',
    body: JSON.stringify({ accountEmail: options.accountEmail, contacts }),
  });
}
