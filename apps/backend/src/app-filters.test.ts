import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import { openSpendStore } from './spend-store';

import {
  postJson,
  postTriageRun,
  getCommands,
  firstPendingFilterProposalId,
  approveFilterProposal,
  postAcknowledgement,
  acknowledgeFilterCreation,
  temporaryDatabasePath,
  clockAtTenPastThree,
  triageAnsweringInOrder,
  reportShopNewsletter,
  reportTriageAndConfirmShopNewsletters,
  filterAnswering,
  filterRecordingAskedCandidates,
  shopNewsletterArchiveProposal,
  shopNewsletterArchiveTriage,
  shopNewslettersFilterProposal,
} from './app.test-support';

describe('backend app: filter proposals and Gmail filters', () => {
  it('asks the filter port once for a proposal when a filter candidate appears and stores it with the account, the candidate messages, the prompt version and the time, without asking again about the same candidate', async () => {
    const filterProposal = {
      criteria: { from: 'news@shop.example.com' },
      labelName: 'Shop newsletters',
      skipInbox: true,
    };
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, filterProposal);
    const triage = shopNewsletterArchiveTriage();
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath,
      triage,
      filter,
    });
    await reportTriageAndConfirmShopNewsletters(app, ['newsletter-1', 'newsletter-2', 'newsletter-3', 'newsletter-4']);
    const { openFilterProposalStore } = await import('./filter-proposal-store');

    expect({ askedCandidates, stored: openFilterProposalStore(databasePath).loadAll() }).toMatchObject({
      askedCandidates: [
        {
          accountEmail: 'ana@example.com',
          criteria: { from: 'Shop <news@shop.example.com>' },
          messageIds: ['newsletter-1', 'newsletter-2', 'newsletter-3'],
        },
      ],
      stored: [
        {
          accountEmail: 'ana@example.com',
          messageIds: ['newsletter-1', 'newsletter-2', 'newsletter-3'],
          promptVersion: 'filter-v1',
          proposedAt: '2026-11-02T15:10:00.000Z',
          proposal: filterProposal,
        },
      ],
    });
  });

  it('does not ask the filter port again after a backend restart on the same database file about a candidate whose filter proposal was stored before it', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, shopNewslettersFilterProposal);
    const triage = shopNewsletterArchiveTriage();
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage,
      filter,
    };
    const beforeRestart = createApp(options);
    for (const messageId of ['newsletter-1', 'newsletter-2', 'newsletter-3', 'newsletter-4']) {
      await reportShopNewsletter(beforeRestart, messageId);
      await postTriageRun(beforeRestart);
      if (messageId !== 'newsletter-4') {
        await postJson(beforeRestart, '/verdicts', { messageId, decision: 'confirmed' });
      }
    }
    askedCandidates.length = 0;
    const afterRestart = createApp(options);

    await postJson(afterRestart, '/verdicts', { messageId: 'newsletter-4', decision: 'confirmed' });

    expect(askedCandidates).toMatchObject([]);
  });

  it('asks the filter port, also after a backend restart on the same database file, with each candidate message carrying its sender and subject as reported', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, shopNewslettersFilterProposal);
    const triage = shopNewsletterArchiveTriage();
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage,
      filter,
    };
    const subjects = { 'newsletter-1': 'New arrivals', 'newsletter-2': 'Winter sale', 'newsletter-3': 'Last chance' };
    const beforeRestart = createApp(options);
    for (const [messageId, subject] of Object.entries(subjects)) {
      await reportShopNewsletter(beforeRestart, messageId, subject);
      await postTriageRun(beforeRestart);
      if (messageId !== 'newsletter-3') {
        await postJson(beforeRestart, '/verdicts', { messageId, decision: 'confirmed' });
      }
    }
    const afterRestart = createApp(options);

    await postJson(afterRestart, '/verdicts', { messageId: 'newsletter-3', decision: 'confirmed' });

    expect(askedCandidates).toMatchObject([
      {
        messages: [
          { from: 'Shop <news@shop.example.com>', subject: 'New arrivals' },
          { from: 'Shop <news@shop.example.com>', subject: 'Winter sale' },
          { from: 'Shop <news@shop.example.com>', subject: 'Last chance' },
        ],
      },
    ]);
  });

  it('counts toward a filter candidate only archives: a confirmed keep proposal does not count, while a rejected proposal corrected to archive does', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, {
      criteria: { from: 'news@shop.example.com' },
      labelName: 'Shop',
      skipInbox: true,
    });
    const proposalWith = (action: string) => ({
      action,
      category: 'sales',
      summary: 'A shop newsletter',
      extract: {},
      reason: 'Promotional mail',
    });
    const decisions = [
      { messageId: 'newsletter-1', action: 'archive', verdict: { decision: 'confirmed' } },
      { messageId: 'newsletter-2', action: 'keep', verdict: { decision: 'confirmed' } },
      { messageId: 'newsletter-3', action: 'archive', verdict: { decision: 'confirmed' } },
      {
        messageId: 'newsletter-4',
        action: 'keep',
        verdict: { decision: 'rejected', correction: { action: 'archive' } },
      },
    ];
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      triage: triageAnsweringInOrder(
        decisions.map(({ action }) => proposalWith(action)),
        0,
      ),
      filter,
    });
    for (const { messageId, verdict } of decisions) {
      await reportShopNewsletter(app, messageId);
      await postTriageRun(app);
      await postJson(app, '/verdicts', { messageId, ...verdict });
    }

    expect(askedCandidates).toMatchObject([
      {
        accountEmail: 'ana@example.com',
        criteria: { from: 'Shop <news@shop.example.com>' },
        messageIds: ['newsletter-1', 'newsletter-3', 'newsletter-4'],
      },
    ]);
  });

  it('logs each filter-port call as spend, so a filter proposal that brings the day to the ceiling pauses triage at GET /triage-queue', async () => {
    const filter = {
      propose: () =>
        Promise.resolve({
          proposal: { criteria: { from: 'news@shop.example.com' }, labelName: 'Shop', skipInbox: true },
          costInUsd: 17,
          promptVersion: 'filter-v1',
        }),
    };
    const databasePath = temporaryDatabasePath();
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      databasePath,
      triage: triageAnsweringInOrder(
        [shopNewsletterArchiveProposal, shopNewsletterArchiveProposal, shopNewsletterArchiveProposal],
        1,
      ),
      filter,
    });
    await reportTriageAndConfirmShopNewsletters(app);

    const queue = await app.request('/triage-queue');

    expect({
      loggedCosts: openSpendStore(databasePath)
        .loadAll()
        .map(({ costInUsd }) => costInUsd),
      queue: await queue.json(),
    }).toMatchObject({ loggedCosts: [1, 1, 1, 17], queue: { paused: true } });
  });
  it('does not ask the filter port for a proposal when a filter candidate appears while triage is paused by the daily spend ceiling', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(
      askedCandidates,
      { criteria: { from: 'news@shop.example.com' }, labelName: 'Shop', skipInbox: true },
      1,
    );
    const app = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      triage: triageAnsweringInOrder(
        [shopNewsletterArchiveProposal, shopNewsletterArchiveProposal, shopNewsletterArchiveProposal],
        7,
      ),
      filter,
    });
    await reportTriageAndConfirmShopNewsletters(app);

    expect(askedCandidates).toMatchObject([]);
  });

  it('stops asking the filter port partway through a run once a proposal brings the day to the spend ceiling, leaving the next candidate unasked', async () => {
    const databasePath = temporaryDatabasePath();
    const beforeRestart = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath,
      triage: triageAnsweringInOrder(Array.from({ length: 7 }, () => shopNewsletterArchiveProposal), 0),
    });
    await reportTriageAndConfirmShopNewsletters(beforeRestart);
    for (const messageId of ['deals-1', 'deals-2', 'deals-3']) {
      await postJson(beforeRestart, '/mail-report', {
        accountEmail: 'ana@example.com',
        historyId: '1002',
        messages: [
          {
            id: messageId,
            threadId: messageId,
            from: 'Deals <deals@store.example.com>',
            to: 'ana@example.com',
            subject: 'Deals of the week',
            date: 'Mon, 2 Nov 2026 10:00:00 -0600',
            snippet: 'Big discounts',
          },
        ],
      });
      await postTriageRun(beforeRestart);
      await postJson(beforeRestart, '/verdicts', { messageId, decision: 'confirmed' });
    }
    await reportShopNewsletter(beforeRestart, 'newsletter-4');
    await postTriageRun(beforeRestart);
    const askedCandidates: unknown[] = [];
    const afterRestart = createApp({
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      dailySpendCeilingInUsd: 20,
      databasePath,
      triage: triageAnsweringInOrder([], 0),
      filter: filterRecordingAskedCandidates(askedCandidates, shopNewslettersFilterProposal, 20),
    });

    await postJson(afterRestart, '/verdicts', { messageId: 'newsletter-4', decision: 'confirmed' });

    expect(askedCandidates).toHaveLength(1);
  });

  function appProposingShopNewslettersFilter() {
    const filter = filterAnswering(shopNewslettersFilterProposal);
    const triage = shopNewsletterArchiveTriage();
    return createApp({ allowedEmails: ['ana@example.com'], clock: clockAtTenPastThree, triage, filter });
  }

  it('lists at GET /filter-proposals each pending filter proposal with its criteria, label, account and the count of archives behind it', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app, ['newsletter-1', 'newsletter-2', 'newsletter-3']);

    const response = await app.request('/filter-proposals');

    expect({ status: response.status, body: await response.json() }).toMatchObject({
      status: 200,
      body: {
        proposals: [
          {
            criteria: { from: 'news@shop.example.com' },
            labelName: 'Shop newsletters',
            accountEmail: 'ana@example.com',
            archiveCount: 3,
          },
        ],
      },
    });
  });

  it('lists at GET /commands for the account a create-filter command with the criteria and label once its filter proposal is approved through POST /filter-proposals/:id/approval', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);

    const approval = await approveFilterProposal(app, proposalId);
    const commands = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: unknown[] };

    expect({ status: approval.status, commands: commands.commands }).toMatchObject({
      status: 200,
      commands: expect.arrayContaining([
        expect.objectContaining({
          type: 'create-filter',
          criteria: { from: 'news@shop.example.com' },
          labelName: 'Shop newsletters',
        }),
      ]) as unknown,
    });
  });

  it('still lists at GET /commands the create-filter command of a filter proposal approved before a backend restart on the same database file', async () => {
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering(shopNewslettersFilterProposal),
    };
    const beforeRestart = createApp(options);
    await reportTriageAndConfirmShopNewsletters(beforeRestart);
    const proposalId = await firstPendingFilterProposalId(beforeRestart);
    await approveFilterProposal(beforeRestart, proposalId);
    const afterRestart = createApp(options);

    const commands = (await (await getCommands(afterRestart, 'ana@example.com')).json()) as {
      commands: { type?: string; id?: string }[];
    };

    expect(commands.commands.filter(({ type }) => type === 'create-filter')).toMatchObject([
      { id: `create-filter-${proposalId}`, criteria: { from: 'news@shop.example.com' }, labelName: 'Shop newsletters' },
    ]);
  });

  it('lists no create-filter command at GET /commands for a pending filter proposal that was never approved', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);

    const listed = (await (await app.request('/filter-proposals')).json()) as { proposals: unknown[] };
    const commands = (await (await getCommands(app, 'ana@example.com')).json()) as { commands: { type?: string }[] };

    expect({
      pendingProposals: listed.proposals.length,
      createFilterCommands: commands.commands.filter(({ type }) => type === 'create-filter'),
    }).toEqual({ pendingProposals: 1, createFilterCommands: [] });
  });

  it('lists at GET /commands a create-filter command with the id create-filter-<proposal id>, and no longer lists it once acknowledged through POST /commands/:id/acknowledgement', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await approveFilterProposal(app, proposalId);
    const createFilterCommands = async () =>
      (
        (await (await getCommands(app, 'ana@example.com')).json()) as { commands: { type?: string; id?: string }[] }
      ).commands.filter(({ type }) => type === 'create-filter');

    const [command] = await createFilterCommands();
    await postAcknowledgement(app, command?.id ?? '');

    expect({ id: command?.id, afterAcknowledgement: await createFilterCommands() }).toEqual({
      id: `create-filter-${proposalId}`,
      afterAcknowledgement: [],
    });
  });

  it('lists at GET /filters a filter only once its create-filter command is acknowledged, with its criteria, label, account and the Gmail filter id', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await approveFilterProposal(app, proposalId);
    const listFilters = async () => {
      const response = await app.request('/filters');
      return { status: response.status, body: response.ok ? await response.json() : undefined };
    };

    const beforeAcknowledgement = await listFilters();
    await acknowledgeFilterCreation(app, proposalId, 'gmail-filter-1');
    const afterAcknowledgement = await listFilters();

    expect({ beforeAcknowledgement, afterAcknowledgement }).toEqual({
      beforeAcknowledgement: { status: 200, body: { filters: [] } },
      afterAcknowledgement: {
        status: 200,
        body: {
          filters: [
            expect.objectContaining({
              criteria: { from: 'news@shop.example.com' },
              labelName: 'Shop newsletters',
              accountEmail: 'ana@example.com',
              gmailFilterId: 'gmail-filter-1',
            }),
          ],
        },
      },
    });
  });

  it('says at GET /filters when each filter was approved and when its creation was acknowledged, from the clock at each event, also after a backend restart on the same database file', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      databasePath: temporaryDatabasePath(),
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering(shopNewslettersFilterProposal),
    };
    const beforeRestart = createApp(options);
    await reportTriageAndConfirmShopNewsletters(beforeRestart);
    const proposalId = await firstPendingFilterProposalId(beforeRestart);
    currentTime = new Date('2026-11-02T15:20:00.000Z');
    await approveFilterProposal(beforeRestart, proposalId);
    currentTime = new Date('2026-11-02T15:25:00.000Z');
    await acknowledgeFilterCreation(beforeRestart, proposalId, 'gmail-filter-1');
    currentTime = new Date('2026-11-02T16:00:00.000Z');
    const afterRestart = createApp(options);

    const response = await afterRestart.request('/filters');

    expect(await response.json()).toEqual({
      filters: [
        expect.objectContaining({
          gmailFilterId: 'gmail-filter-1',
          approvedAt: '2026-11-02T15:20:00.000Z',
          acknowledgedAt: '2026-11-02T15:25:00.000Z',
        }),
      ],
    });
  });

  it('yields after DELETE /filters/:id a delete-filter command with the Gmail filter id at GET /commands for that filter account only', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await approveFilterProposal(app, proposalId);
    await acknowledgeFilterCreation(app, proposalId, 'gmail-filter-1');
    const deleteFilterCommands = async (accountEmail: string) =>
      ((await (await getCommands(app, accountEmail)).json()) as { commands: { type?: string }[] }).commands.filter(
        ({ type }) => type === 'delete-filter',
      );

    const deletion = await app.request('/filters/gmail-filter-1', { method: 'DELETE' });

    expect({
      status: deletion.status,
      filterAccount: await deleteFilterCommands('ana@example.com'),
      otherAccount: await deleteFilterCommands('bruno@example.com'),
    }).toEqual({
      status: 200,
      filterAccount: [expect.objectContaining({ type: 'delete-filter', gmailFilterId: 'gmail-filter-1' })],
      otherAccount: [],
    });
  });

  it('drops the filter from GET /filters and its delete-filter command from GET /commands once that command is acknowledged', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);
    await approveFilterProposal(app, proposalId);
    await acknowledgeFilterCreation(app, proposalId, 'gmail-filter-1');
    await app.request('/filters/gmail-filter-1', { method: 'DELETE' });
    const deleteFilterCommand = (
      (await (await getCommands(app, 'ana@example.com')).json()) as { commands: { id: string; type?: string }[] }
    ).commands.find(({ type }) => type === 'delete-filter');

    await postAcknowledgement(app, deleteFilterCommand?.id ?? '');

    expect({
      filters: ((await (await app.request('/filters')).json()) as { filters: unknown[] }).filters,
      deleteFilterCommands: (
        (await (await getCommands(app, 'ana@example.com')).json()) as { commands: { type?: string }[] }
      ).commands.filter(({ type }) => type === 'delete-filter'),
    }).toEqual({ filters: [], deleteFilterCommands: [] });
  });

  it('still lists at GET /commands the delete-filter command of a deletion requested before a backend restart on the same database file, with the time the deletion was requested', async () => {
    let currentTime = new Date('2026-11-02T15:10:00.000Z');
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: { now: () => currentTime },
      databasePath: temporaryDatabasePath(),
      triage: shopNewsletterArchiveTriage(),
      filter: filterAnswering(shopNewslettersFilterProposal),
    };
    const beforeRestart = createApp(options);
    await reportTriageAndConfirmShopNewsletters(beforeRestart);
    const proposalId = await firstPendingFilterProposalId(beforeRestart);
    await approveFilterProposal(beforeRestart, proposalId);
    await acknowledgeFilterCreation(beforeRestart, proposalId, 'gmail-filter-1');
    currentTime = new Date('2026-11-02T15:30:00.000Z');
    await beforeRestart.request('/filters/gmail-filter-1', { method: 'DELETE' });
    currentTime = new Date('2026-11-02T16:00:00.000Z');
    const afterRestart = createApp(options);

    const commands = (await (await getCommands(afterRestart, 'ana@example.com')).json()) as {
      commands: { type?: string }[];
    };

    expect(commands.commands.filter(({ type }) => type === 'delete-filter')).toEqual([
      {
        id: 'delete-filter-gmail-filter-1',
        type: 'delete-filter',
        gmailFilterId: 'gmail-filter-1',
        requestedAt: '2026-11-02T15:30:00.000Z',
      },
    ]);
  });

  it('no longer lists at GET /filter-proposals a filter proposal rejected through POST /filter-proposals/:id/rejection', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);

    const rejection = await app.request(`/filter-proposals/${proposalId}/rejection`, {
      method: 'POST',
    });
    const afterRejection = (await (await app.request('/filter-proposals')).json()) as { proposals: unknown[] };

    expect({ status: rejection.status, proposals: afterRejection.proposals }).toEqual({ status: 200, proposals: [] });
  });

  it('no longer lists at GET /filter-proposals a filter proposal approved through POST /filter-proposals/:id/approval', async () => {
    const app = appProposingShopNewslettersFilter();
    await reportTriageAndConfirmShopNewsletters(app);
    const proposalId = await firstPendingFilterProposalId(app);

    const approval = await approveFilterProposal(app, proposalId);
    const afterApproval = (await (await app.request('/filter-proposals')).json()) as { proposals: unknown[] };

    expect({ status: approval.status, proposals: afterApproval.proposals }).toEqual({ status: 200, proposals: [] });
  });

  it('neither asks the filter port again nor lists a proposal at GET /filter-proposals for further confirmed archives from a sender whose filter proposal was rejected, also after a backend restart on the same database file', async () => {
    const askedCandidates: unknown[] = [];
    const filter = filterRecordingAskedCandidates(askedCandidates, shopNewslettersFilterProposal);
    const triage = shopNewsletterArchiveTriage();
    const options = {
      allowedEmails: ['ana@example.com'],
      clock: clockAtTenPastThree,
      databasePath: temporaryDatabasePath(),
      triage,
      filter,
    };
    const beforeRestart = createApp(options);
    await reportTriageAndConfirmShopNewsletters(beforeRestart);
    const proposalId = await firstPendingFilterProposalId(beforeRestart);
    await beforeRestart.request(`/filter-proposals/${proposalId}/rejection`, { method: 'POST' });
    askedCandidates.length = 0;
    const afterRestart = createApp(options);

    await reportTriageAndConfirmShopNewsletters(afterRestart, ['newsletter-4', 'newsletter-5']);
    const afterRejection = (await (await afterRestart.request('/filter-proposals')).json()) as { proposals: unknown[] };

    expect({ askedCandidates, proposals: afterRejection.proposals }).toEqual({ askedCandidates: [], proposals: [] });
  });
});
