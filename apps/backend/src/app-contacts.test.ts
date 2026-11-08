import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { openProposalStore } from './proposal-store';

import {
  postJson,
  postTriageRun,
  getContacts,
  byPrimaryEmail,
  getOrganizations,
  markContact,
  unmarkContact,
  setContactDetails,
  temporaryDatabasePath,
  clockAtTenPastThree,
  budgetReviewReport,
  triageAnswering,
  triageAnsweringByMessageId,
  budgetReviewReportWithSecondMessageFromMarta,
  keepProposalExtracting,
} from './app.test-support';

describe('backend app: contacts, organizations and the Google Contacts import', () => {
  it.each([
    {
      rule: 'a display name and an address',
      from: 'Luis <luis@example.com>',
      displayName: 'Luis',
      email: 'luis@example.com',
    },
    {
      rule: 'a bare address, named by that address',
      from: 'ana@acme.com',
      displayName: 'ana@acme.com',
      email: 'ana@acme.com',
    },
    {
      rule: 'a quoted display name, named without the quotes',
      from: '"Ana Ruiz" <ana@acme.com>',
      displayName: 'Ana Ruiz',
      email: 'ana@acme.com',
    },
  ])(
    'lists at GET /contacts, once a message is reported at POST /mail-report, its sender as a contact named from a From header with $rule',
    async ({ from, displayName, email }) => {
      const app = createApp({ allowedEmails: ['ana@example.com'] });
      const message = { ...budgetReviewReport.messages[0], from };
      await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [message] });

      const response = await app.request('/contacts');

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ contacts: [{ displayName, emails: [email] }] });
    },
  );

  it('lists at GET /contacts one contact for two messages from the same email reported on different accounts', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com', 'bob@example.com'] });
    await postJson(app, '/mail-report', budgetReviewReport);
    const sameSenderToBob = {
      ...budgetReviewReport.messages[0],
      id: 'message-2',
      threadId: 'thread-2',
      to: 'bob@example.com',
    };
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      accountEmail: 'bob@example.com',
      messages: [sameSenderToBob],
    });

    const response = await app.request('/contacts');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contacts: [{ displayName: 'Luis', emails: ['luis@example.com'] }] });
  });

  it('lists at GET /contacts/:email/timeline every message that contact sent, across every account, newest first, each with its account and Gmail link', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com', 'bob@example.com'] });
    await postJson(app, '/mail-report', budgetReviewReport);
    const laterToBob = {
      ...budgetReviewReport.messages[0],
      id: 'message-2',
      threadId: 'thread-2',
      to: 'bob@example.com',
      subject: 'Budget follow-up',
      date: 'Mon, 2 Nov 2026 10:00:00 -0600',
    };
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      accountEmail: 'bob@example.com',
      messages: [laterToBob],
    });

    const response = await app.request('/contacts/luis@example.com/timeline');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      messages: [
        {
          id: 'message-2',
          subject: 'Budget follow-up',
          accountEmail: 'bob@example.com',
          link: 'https://mail.google.com/mail/?authuser=bob%40example.com#all/message-2',
        },
        {
          id: 'message-1',
          subject: 'Budget review',
          accountEmail: 'ana@example.com',
          link: 'https://mail.google.com/mail/?authuser=ana%40example.com#all/message-1',
        },
      ],
    });
  });

  it('lists at GET /contacts two contacts for two messages from different emails', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'] });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);

    const response = await app.request('/contacts');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      contacts: [
        { displayName: 'Luis', emails: ['luis@example.com'] },
        { displayName: 'Marta', emails: ['marta@acme.com'] },
      ],
    });
  });

  it('lists at GET /contacts, once a message is triaged with an extraction naming a person with an email, that person as a contact linked to the message', async () => {
    const triage = triageAnswering(
      keepProposalExtracting({ people: [{ name: 'Marta Díaz', email: 'marta@acme.com', role: 'copied' }] }),
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const response = await app.request('/contacts');

    expect(response.status).toBe(200);
    const { contacts } = (await response.json()) as { contacts: unknown[] };
    expect(contacts).toContainEqual(
      expect.objectContaining({
        displayName: 'Marta Díaz',
        emails: ['marta@acme.com'],
        messageIds: ['message-1'],
      }),
    );
  });

  it('lists at GET /contacts no contact for a person in a triaged extraction who has no email', async () => {
    const triage = triageAnswering(keepProposalExtracting({ people: [{ name: 'Marta Díaz', role: 'mentioned' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const response = await app.request('/contacts');

    expect(response.status).toBe(200);
    const { contacts } = (await response.json()) as { contacts: { displayName: string }[] };
    expect(contacts.map(({ displayName }) => displayName)).toEqual(['Luis']);
  });

  it('lists at GET /contacts one contact, holding every message, for a person who sent one message and is named by email in two triaged extractions', async () => {
    const triage = triageAnswering(
      keepProposalExtracting({ people: [{ name: 'Luis Pérez', email: 'luis@example.com', role: 'mentioned' }] }),
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);
    await postTriageRun(app);

    const response = await app.request('/contacts');

    expect(response.status).toBe(200);
    const { contacts } = (await response.json()) as { contacts: { emails: string[]; messageIds?: string[] }[] };
    const luisContacts = contacts.filter(({ emails }) => emails.includes('luis@example.com'));
    expect(luisContacts).toHaveLength(1);
    expect(luisContacts[0]?.messageIds).toEqual(['message-1', 'message-2']);
  });

  it("lists a reported message that is not yet triaged under both parties it links to: its sender contact and the organization of its sender's domain", async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReport);

    const { contacts } = await getContacts(app);
    const { organizations } = await getOrganizations(app);

    const partiesListingTheMessage = [
      ...contacts.filter(({ messageIds }) => messageIds.includes('message-1')).flatMap(({ emails }) => emails),
      ...organizations.filter(({ messageIds }) => messageIds.includes('message-1')).map(({ name }) => name),
    ];
    expect(partiesListingTheMessage.toSorted()).toEqual(['example.com', 'luis@example.com']);
  });

  it('lists a message under no contact it does not link to: a second message from another sender, whose extraction names nobody, appears under its sender alone, not under the first sender or the person the first message names', async () => {
    const triage = triageAnsweringByMessageId({
      'message-1': keepProposalExtracting({
        people: [{ name: 'Pedro Soto', email: 'pedro@acme.com', role: 'copied' }],
      }),
      'message-2': keepProposalExtracting({ people: [] }),
    });
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);
    await postTriageRun(app);

    const { contacts } = await getContacts(app);

    const contactsListingTheSecondMessage = contacts
      .filter(({ messageIds }) => messageIds.includes('message-2'))
      .flatMap(({ emails }) => emails);
    expect(contactsListingTheSecondMessage).toEqual(['marta@acme.com']);
  });

  it.each([
    {
      rule: 'a message triaged with an extraction that names an organization, that organization with the message linked to it',
      extraction: { organization: 'Mutuus' },
      report: budgetReviewReport,
      organizations: [{ name: 'Mutuus', messageIds: ['message-1'] }],
    },
    {
      rule: "a message triaged with an extraction that names no organization, the organization of its sender's domain with the message linked to it",
      extraction: {},
      report: budgetReviewReport,
      organizations: [{ name: 'example.com', messageIds: ['message-1'] }],
    },
    {
      rule: 'two messages triaged with extractions naming the same organization, one organization holding both messages',
      extraction: { organization: 'Mutuus' },
      report: budgetReviewReportWithSecondMessageFromMarta,
      organizations: [{ name: 'Mutuus', messageIds: ['message-1', 'message-2'] }],
    },
  ])('lists at GET /organizations, for $rule', async ({ extraction, report, organizations }) => {
    const triage = triageAnswering(keepProposalExtracting(extraction));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', report);
    await postTriageRun(app);

    const response = await app.request('/organizations');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ organizations });
  });

  it.each(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com'])(
    'lists at GET /organizations no organization for a message from the free-mail domain %s whose extraction names no organization',
    async (freeMailDomain) => {
      const triage = triageAnswering(keepProposalExtracting());
      const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
      const fromGmail = { ...budgetReviewReport.messages[0], from: `Luis <luis@${freeMailDomain}>` };
      await postJson(app, '/mail-report', { ...budgetReviewReport, messages: [fromGmail] });
      await postTriageRun(app);

      const response = await app.request('/organizations');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ organizations: [] });
    },
  );

  it('lists at GET /organizations a message once, under the organization its latest proposal names, when the store holds two proposals for it', async () => {
    const databasePath = temporaryDatabasePath();
    const before = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });
    await postJson(before, '/mail-report', budgetReviewReport);
    const store = openProposalStore(databasePath);
    const proposalNaming = (organization: string) => ({
      action: 'keep',
      category: 'unknown',
      summary: 'A budget review',
      extract: {},
      reason: 'Proposed twice',
      organization,
    });
    store.save({
      messageId: 'message-1',
      madeAt: '2026-11-02T15:00:00.000Z',
      promptVersion: 'triage-v2',
      proposal: proposalNaming('Acme'),
    });
    store.save({
      messageId: 'message-1',
      madeAt: '2026-11-02T15:01:00.000Z',
      promptVersion: 'triage-v2',
      proposal: proposalNaming('Mutuus'),
    });

    const afterRestart = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, databasePath });
    const response = await afterRestart.request('/organizations');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ organizations: [{ name: 'Mutuus', messageIds: ['message-1'] }] });
  });

  it('still lists at GET /contacts and GET /organizations, after a backend restart on the same database file, every contact and organization with the messages linked to them before it: the senders, the person the extraction named and the organization it named, with nothing reported or triaged again', async () => {
    const triage = triageAnsweringByMessageId({
      'message-1': keepProposalExtracting({
        organization: 'Mutuus',
        people: [{ name: 'Pedro Soto', email: 'pedro@acme.com', role: 'copied' }],
      }),
      'message-2': keepProposalExtracting({ people: [] }),
    });
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
    const beforeRestart = createApp({ ...options, triage });
    await postJson(beforeRestart, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);
    await postTriageRun(beforeRestart);

    const afterRestart = createApp(options);
    const { contacts } = await getContacts(afterRestart);
    const { organizations } = await getOrganizations(afterRestart);

    expect(contacts.toSorted(byPrimaryEmail)).toMatchObject([
      { displayName: 'Luis', emails: ['luis@example.com'], messageIds: ['message-1'] },
      { displayName: 'Marta', emails: ['marta@acme.com'], messageIds: ['message-2'] },
      { displayName: 'Pedro Soto', emails: ['pedro@acme.com'], messageIds: ['message-1'] },
    ]);
    expect(organizations.toSorted((left, right) => left.name.localeCompare(right.name))).toEqual([
      { name: 'acme.com', messageIds: ['message-2'] },
      { name: 'Mutuus', messageIds: ['message-1'] },
    ]);
  });

  it('lists at GET /contacts a contact marked vip through PUT /contacts/:email/marks/vip with the vip mark, and an unmarked contact with no marks', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);

    await markContact(app, 'luis@example.com', 'vip');
    const { contacts } = await getContacts(app);

    expect(contacts.toSorted(byPrimaryEmail)).toMatchObject([
      { emails: ['luis@example.com'], marks: ['vip'] },
      { emails: ['marta@acme.com'], marks: [] },
    ]);
  });

  it('lists at GET /people a contact marked vip through PUT /contacts/:email/marks/vip under VIP and not under Everyone else', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);
    await markContact(app, 'luis@example.com', 'vip');

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(vip.map(({ emails }) => emails)).toEqual([['luis@example.com']]);
    expect(everyoneElse.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
  });

  it('lists at GET /people under VIP, and not under Everyone else, a contact whose email is on the "Always matters" line of the profile of the account that received its message', async () => {
    const profileDirectory = mkdtempSync(join(tmpdir(), 'my-life-profile-'));
    writeFileSync(
      join(profileDirectory, 'example.md'),
      '## People\n\n- Always matters: luis@example.com\n- Never matters: (to fill)\n',
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, profileDirectory });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(vip.map(({ emails }) => emails)).toEqual([['luis@example.com']]);
    expect(everyoneElse.map(({ emails }) => emails)).toEqual([['marta@acme.com']]);
  });

  it('lists at GET /people under Everyone else, and not under VIP, a contact on the "Always matters" line whose vip mark the user removed through DELETE /contacts/:email/marks/vip', async () => {
    const profileDirectory = mkdtempSync(join(tmpdir(), 'my-life-profile-'));
    writeFileSync(
      join(profileDirectory, 'example.md'),
      '## People\n\n- Always matters: luis@example.com\n- Never matters: (to fill)\n',
    );
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, profileDirectory });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);

    await unmarkContact(app, 'luis@example.com', 'vip');
    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(vip).toEqual([]);
    expect(everyoneElse.map(({ emails }) => emails)).toContainEqual(['luis@example.com']);
  });

  it('still answers at GET /people, with no "Always matters" VIPs, when the profile directory has no profile file for the account that received the messages', async () => {
    const profileDirectory = mkdtempSync(join(tmpdir(), 'my-life-profile-'));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, profileDirectory });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, everyoneElse } = (await response.json()) as {
      vip: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(vip).toEqual([]);
    expect(everyoneElse.map(({ emails }) => emails).toSorted()).toEqual([['luis@example.com'], ['marta@acme.com']]);
  });

  it('lists at GET /people under Everyone else the contact whose most recent message is newest first', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const [luisMessage, martaMessage] = budgetReviewReportWithSecondMessageFromMarta.messages;
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [luisMessage, { ...martaMessage, date: 'Mon, 2 Nov 2026 09:05:00 -0600' }],
    });

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { everyoneElse } = (await response.json()) as { everyoneElse: { emails: string[] }[] };
    expect(everyoneElse.map(({ emails }) => emails)).toEqual([['marta@acme.com'], ['luis@example.com']]);
  });

  it('lists at GET /people a non-VIP contact whose triaged message carries a deadline inside 48 hours under Urgent with the reason "deadline", and not under Everyone else', async () => {
    const tomorrowNoon = '2026-11-03T12:00:00-06:00';
    const triage = triageAnswering(keepProposalExtracting({ dates: [tomorrowNoon] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { urgent, everyoneElse } = (await response.json()) as {
      urgent: { emails: string[]; reasons: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(urgent).toEqual([expect.objectContaining({ emails: ['luis@example.com'], reasons: ['deadline'] })]);
    expect(everyoneElse.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
  });

  it('lists at GET /people a non-VIP contact whose triaged message carries a date more than 48 hours away under Everyone else and not under Urgent', async () => {
    const nextWeek = '2026-11-10T12:00:00-06:00';
    const triage = triageAnswering(keepProposalExtracting({ dates: [nextWeek] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { urgent, everyoneElse } = (await response.json()) as {
      urgent: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(everyoneElse.map(({ emails }) => emails)).toContainEqual(['luis@example.com']);
    expect(urgent.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
  });

  it('lists at GET /people a non-VIP contact whose only extracted deadline has already passed under Everyone else and not under Urgent', async () => {
    const lastSaturdayNoon = '2026-10-31T12:00:00-06:00';
    const triage = triageAnswering(keepProposalExtracting({ dates: [lastSaturdayNoon] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { urgent, everyoneElse } = (await response.json()) as {
      urgent: { emails: string[] }[];
      everyoneElse: { emails: string[] }[];
    };
    expect(everyoneElse.map(({ emails }) => emails)).toContainEqual(['luis@example.com']);
    expect(urgent.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
  });

  it('lists at GET /people a VIP contact whose message has waited more than 1 business day for a reply under both VIP and Urgent, with the reason "VIP waiting"', async () => {
    const clockOnWednesdayMorning = { now: () => new Date('2026-11-04T17:00:00.000Z') };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning });
    await postJson(app, '/mail-report', budgetReviewReport);
    await markContact(app, 'luis@example.com', 'vip');

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, urgent } = (await response.json()) as {
      vip: { emails: string[] }[];
      urgent: { emails: string[]; reasons: string[] }[];
    };
    expect(vip.map(({ emails }) => emails)).toEqual([['luis@example.com']]);
    expect(urgent).toEqual([expect.objectContaining({ emails: ['luis@example.com'], reasons: ['VIP waiting'] })]);
  });

  it('does not list at GET /people under Urgent a VIP contact whose message the user answered in the thread, nor a VIP contact whose message arrived less than 1 business day ago', async () => {
    const clockOnWednesdayMorning = { now: () => new Date('2026-11-04T17:00:00.000Z') };
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning });
    const luisMondayMessage = budgetReviewReport.messages[0];
    await postJson(app, '/mail-report', {
      ...budgetReviewReport,
      messages: [
        luisMondayMessage,
        {
          ...luisMondayMessage,
          id: 'message-reply',
          from: 'Ana <ana@example.com>',
          to: 'luis@example.com',
          date: 'Mon, 2 Nov 2026 10:00:00 -0600',
          sentByUser: true,
        },
        {
          ...luisMondayMessage,
          id: 'message-2',
          threadId: 'thread-2',
          from: 'Marta <marta@acme.com>',
          date: 'Wed, 4 Nov 2026 08:00:00 -0600',
        },
      ],
    });
    await markContact(app, 'luis@example.com', 'vip');
    await markContact(app, 'marta@acme.com', 'vip');

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { vip, urgent } = (await response.json()) as {
      vip: { emails: string[] }[];
      urgent: { emails: string[] }[];
    };
    expect(vip.map(({ emails }) => emails)).toEqual(
      expect.arrayContaining([['luis@example.com'], ['marta@acme.com']]),
    );
    expect(urgent.map(({ emails }) => emails)).not.toContainEqual(['luis@example.com']);
    expect(urgent.map(({ emails }) => emails)).not.toContainEqual(['marta@acme.com']);
  });

  it('lists at GET /people under Urgent, with the reason "unanswered ask", a non-VIP contact whose ask has waited 2 business days with no reply from the user', async () => {
    const clockOnWednesdayMorning = { now: () => new Date('2026-11-04T17:00:00.000Z') };
    const triage = triageAnswering(keepProposalExtracting({ asks: [{ ask: 'Review the budget' }] }));
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockOnWednesdayMorning, triage });
    await postJson(app, '/mail-report', budgetReviewReport);
    await postTriageRun(app);

    const response = await app.request('/people');

    expect(response.status).toBe(200);
    const { urgent } = (await response.json()) as { urgent: { emails: string[]; reasons: string[] }[] };
    expect(urgent).toEqual([expect.objectContaining({ emails: ['luis@example.com'], reasons: ['unanswered ask'] })]);
  });

  it('lists at GET /contacts, after a backend restart on the same database file, the lists and note set on a contact through PATCH /contacts/:email before it', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);
    await setContactDetails(beforeRestart, 'luis@example.com', {
      lists: ['board', 'investors'],
      note: 'Prefers calls',
    });

    const afterRestart = createApp(options);
    const { contacts } = await getContacts(afterRestart);

    expect(contacts).toMatchObject([
      { emails: ['luis@example.com'], lists: ['board', 'investors'], note: 'Prefers calls' },
    ]);
  });

  it('lists at GET /contacts, after a backend restart on the same database file, a contact marked vip through PUT /contacts/:email/marks/vip before it with the vip mark', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/mail-report', budgetReviewReport);
    await markContact(beforeRestart, 'luis@example.com', 'vip');

    const afterRestart = createApp(options);
    const { contacts } = await getContacts(afterRestart);

    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], marks: ['vip'] }]);
  });

  it('lists at GET /contacts a contact marked vip and then unmarked through DELETE /contacts/:email/marks/vip with no marks', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReport);
    await markContact(app, 'luis@example.com', 'vip');

    await unmarkContact(app, 'luis@example.com', 'vip');
    const { contacts } = await getContacts(app);

    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], marks: [] }]);
  });

  it('answers 400 to PUT and DELETE /contacts/:email/marks/:mark for a mark other than vip', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReport);

    const marked = await markContact(app, 'luis@example.com', 'favorite');
    const unmarked = await unmarkContact(app, 'luis@example.com', 'favorite');

    expect(marked.status).toBe(400);
    expect(unmarked.status).toBe(400);
  });

  it('lists at GET /contacts, for a contact whose note was set through PATCH /contacts/:email after its lists, both the lists and the note; and for one whose lists were set after its note, both the note and the lists', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReportWithSecondMessageFromMarta);

    await setContactDetails(app, 'luis@example.com', { lists: ['board', 'investors'] });
    await setContactDetails(app, 'luis@example.com', { note: 'Prefers calls' });
    await setContactDetails(app, 'marta@acme.com', { note: 'Answers fast' });
    await setContactDetails(app, 'marta@acme.com', { lists: ['suppliers'] });
    const { contacts } = await getContacts(app);

    expect(contacts.toSorted(byPrimaryEmail)).toMatchObject([
      { emails: ['luis@example.com'], lists: ['board', 'investors'], note: 'Prefers calls' },
      { emails: ['marta@acme.com'], lists: ['suppliers'], note: 'Answers fast' },
    ]);
  });

  it('answers 400 to PATCH /contacts/:email whose note is not text or whose lists are not a list of text, and GET /contacts still shows the lists and note set before', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReport);
    await setContactDetails(app, 'luis@example.com', { lists: ['board'], note: 'Prefers calls' });

    const numericNote = await setContactDetails(app, 'luis@example.com', { note: 42 });
    const textLists = await setContactDetails(app, 'luis@example.com', { lists: 'investors' });
    const numericLists = await setContactDetails(app, 'luis@example.com', { lists: ['board', 7] });
    const { contacts } = await getContacts(app);

    expect([numericNote.status, textLists.status, numericLists.status]).toEqual([400, 400, 400]);
    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], lists: ['board'], note: 'Prefers calls' }]);
  });

  it('lists at GET /contacts, after POST /contacts-import brings a contact with the email of a reported sender, one contact for that email holding its message and the imported organization', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/mail-report', budgetReviewReport);

    const importResponse = await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] }],
    });
    const { contacts } = await getContacts(app);

    expect(importResponse.status).toBe(200);
    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], messageIds: ['message-1'], organization: 'Acme' }]);
  });

  it.each([
    {
      imported: 'a contact whose email no reported message carries',
      contact: { name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] },
      listed: { displayName: 'Luis Pérez', emails: ['luis@example.com'], messageIds: [], organization: 'Acme' },
      as: 'a new contact with the imported name, email and organization and no messages',
    },
    {
      imported: 'a starred contact',
      contact: { name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: true, lists: [] },
      listed: { emails: ['luis@example.com'], marks: ['vip'] },
      as: 'that contact with the vip mark',
    },
    {
      imported: 'a contact with a Google label',
      contact: {
        name: 'Luis Pérez',
        emails: ['luis@example.com'],
        organization: 'Acme',
        starred: false,
        lists: ['board'],
      },
      listed: { emails: ['luis@example.com'], lists: ['board'] },
      as: 'that contact with the label as one of its lists',
    },
  ])('lists at GET /contacts, after POST /contacts-import brings $imported, $as', async ({ contact, listed }) => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    await postJson(app, '/contacts-import', { accountEmail: 'ana@example.com', contacts: [contact] });
    const { contacts } = await getContacts(app);

    expect(contacts).toMatchObject([listed]);
  });

  it('lists at GET /contacts, after POST /contacts-import from two accounts brings the same email, one contact holding the organization one account reported and the second address the other reported', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com', 'ana@psmutuus.com'], clock: clockAtTenPastThree });

    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] }],
    });
    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@psmutuus.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com', 'luis@acme.com'], starred: false, lists: [] }],
    });
    const { contacts } = await getContacts(app);

    expect(contacts).toMatchObject([
      {
        displayName: 'Luis Pérez',
        emails: ['luis@example.com', 'luis@acme.com'],
        messageIds: [],
        organization: 'Acme',
      },
    ]);
  });

  it('lists at GET /contacts, after POST /contacts-import brings unstarred a contact the user marked vip through PUT /contacts/:email/marks/vip, that contact still with the vip mark', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await markContact(app, 'luis@example.com', 'vip');

    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] }],
    });
    const { contacts } = await getContacts(app);

    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], marks: ['vip'] }]);
  });

  it('lists at GET /contacts, after POST /contacts-import brings an organization for a contact whose organization the user set through PATCH /contacts/:email, that contact still with the organization the user set', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await setContactDetails(app, 'luis@example.com', { organization: 'Mutuus' });

    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] }],
    });
    const { contacts } = await getContacts(app);

    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], organization: 'Mutuus' }]);
  });

  it('lists at GET /contacts, after a second POST /contacts-import brings another organization for a contact whose organization the user never edited, that contact with the organization of the later import', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] }],
    });

    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Globex', starred: false, lists: [] }],
    });
    const { contacts } = await getContacts(app);

    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], organization: 'Globex' }]);
  });

  it('lists at GET /contacts, after a second POST /contacts-import brings another organization for a contact whose imported organization the user replaced through PATCH /contacts/:email, that contact still with the organization the user set', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] }],
    });
    await setContactDetails(app, 'luis@example.com', { organization: 'Mutuus' });

    await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Globex', starred: false, lists: [] }],
    });
    const { contacts } = await getContacts(app);

    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], organization: 'Mutuus' }]);
  });

  it('accepts POST /contacts-import holding a phone-only contact without any email, skips that contact and lists at GET /contacts the others, a nameless one by its email', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    const response = await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [
        { name: 'Plumber', emails: [], starred: false, lists: [] },
        { emails: ['noreply@vendor.io'], starred: false, lists: [] },
      ],
    });
    const { contacts } = await getContacts(app);

    expect(response.status).toBe(200);
    expect(contacts).toMatchObject([{ displayName: 'noreply@vendor.io', emails: ['noreply@vendor.io'] }]);
  });

  it('lists at GET /contacts with no marks a contact whose vip mark the user removed before a backend restart, after the restarted backend takes the same starred import again', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
    const starredLuis = {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], starred: true, lists: [] }],
    };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/contacts-import', starredLuis);
    await unmarkContact(beforeRestart, 'luis@example.com', 'vip');

    const afterRestart = createApp(options);
    await postJson(afterRestart, '/contacts-import', starredLuis);
    const { contacts } = await getContacts(afterRestart);

    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], marks: [] }]);
  });

  it('lists at GET /contacts, after POST /contacts-import brings starred again a contact whose vip mark the user removed through DELETE /contacts/:email/marks/vip, that contact still with no marks', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });
    const starredLuis = {
      accountEmail: 'ana@example.com',
      contacts: [{ name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: true, lists: [] }],
    };
    await postJson(app, '/contacts-import', starredLuis);
    await unmarkContact(app, 'luis@example.com', 'vip');

    await postJson(app, '/contacts-import', starredLuis);
    const { contacts } = await getContacts(app);

    expect(contacts).toMatchObject([{ emails: ['luis@example.com'], marks: [] }]);
  });

  it('still lists at GET /contacts, after a backend restart on the same database file, a contact imported through POST /contacts-import before it whose email no reported message carries, with its imported name, emails, organization and lists', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
    };
    const beforeRestart = createApp(options);
    await postJson(beforeRestart, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [
        {
          name: 'Luis Pérez',
          emails: ['luis@example.com', 'luis@acme.com'],
          organization: 'Acme',
          starred: false,
          lists: ['board'],
        },
      ],
    });

    const afterRestart = createApp(options);
    const { contacts } = await getContacts(afterRestart);

    expect(contacts).toMatchObject([
      {
        displayName: 'Luis Pérez',
        emails: ['luis@example.com', 'luis@acme.com'],
        messageIds: [],
        organization: 'Acme',
        lists: ['board'],
      },
    ]);
  });

  it('answers 400 to POST /contacts-import whose body does not match the contract and lists at GET /contacts none of its contacts, not even the well-formed one', async () => {
    const app = createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree });

    const response = await postJson(app, '/contacts-import', {
      accountEmail: 'ana@example.com',
      contacts: [
        { name: 'Luis Pérez', emails: ['luis@example.com'], organization: 'Acme', starred: false, lists: [] },
        { name: 'Ana Ruiz', emails: 'ana@acme.com', organization: 'Acme', starred: false, lists: [] },
      ],
    });
    const { contacts } = await getContacts(app);

    expect(response.status).toBe(400);
    expect(contacts).toEqual([]);
  });
});
