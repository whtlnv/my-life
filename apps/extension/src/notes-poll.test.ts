import { describe, expect, it, vi } from 'vitest';

import { pollNotesOnce } from './notes-poll';

const driveApi = 'https://www.googleapis.com/drive/v3';
const googleDocMimeType = 'application/vnd.google-apps.document';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  text: string;
}

// A Drive fake that refuses what the real API refuses: `files.list` answers only a query by name, and
// `files.export` only a supported export type. Like Drive, `name contains` ignores case, and a
// `modifiedTime > '<RFC 3339 time>'` clause keeps only the files modified after that time.
function driveFake(files: DriveFile[], backendPosts: { url: string; body: unknown }[]) {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.href.startsWith(`${driveApi}/files?`)) {
      const query = url.searchParams.get('q') ?? '';
      const nameContains = /name contains '([^']+)'/.exec(query)?.[1];
      if (nameContains === undefined) {
        return Promise.resolve(new Response('invalid query', { status: 400 }));
      }
      const modifiedAfter = /modifiedTime > '([^']+)'/.exec(query)?.[1];
      const matching = files.filter(
        (file) =>
          file.name.toLowerCase().includes(nameContains.toLowerCase()) &&
          (modifiedAfter === undefined || Date.parse(file.modifiedTime) > Date.parse(modifiedAfter)) &&
          (!query.includes(`mimeType = '${googleDocMimeType}'`) || file.mimeType === googleDocMimeType),
      );
      return Promise.resolve(
        Response.json({
          kind: 'drive#fileList',
          files: matching.map(({ id, name, mimeType, modifiedTime, webViewLink }) => ({
            kind: 'drive#file',
            id,
            name,
            mimeType,
            modifiedTime,
            webViewLink,
          })),
        }),
      );
    }
    const exportPath = /^\/drive\/v3\/files\/([^/]+)\/export$/.exec(url.pathname);
    if (url.origin === 'https://www.googleapis.com' && exportPath !== null) {
      const file = files.find((candidate) => candidate.id === decodeURIComponent(exportPath[1] ?? ''));
      if (file === undefined || url.searchParams.get('mimeType') !== 'text/plain') {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      return Promise.resolve(new Response(file.text, { headers: { 'Content-Type': 'text/plain' } }));
    }
    if (url.origin === 'http://127.0.0.1:7777' && init?.method === 'POST') {
      backendPosts.push({ url: url.href, body: JSON.parse(init.body as string) });
      return Promise.resolve(Response.json({ ok: true }));
    }
    return Promise.resolve(new Response('unexpected request', { status: 404 }));
  };
}

describe('pollNotesOnce', () => {
  it("lists the profile's Notes by Gemini docs and posts one notes report with each doc's account, id, title, modified time, web link and plain-text export", async () => {
    const backendPosts: { url: string; body: unknown }[] = [];
    const files: DriveFile[] = [
      {
        id: 'doc-weekly-sync',
        name: 'Weekly sync - 2026/11/12 10:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-12T17:05:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-weekly-sync/edit',
        text: 'Suggested next steps\n[Francisco] Send the budget\n',
      },
      {
        id: 'doc-client-kickoff',
        name: 'Client kickoff - 2026/11/13 09:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-13T16:20:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-client-kickoff/edit',
        text: 'Action items\nAna will share the contract\n',
      },
    ];

    await pollNotesOnce({
      fetch: driveFake(files, backendPosts),
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
    });

    expect(backendPosts).toEqual([
      {
        url: 'http://127.0.0.1:7777/notes-report',
        body: {
          accountEmail: 'francisco@example.com',
          docs: [
            {
              id: 'doc-weekly-sync',
              title: 'Weekly sync - 2026/11/12 10:00 CST - Notes by Gemini',
              modifiedTime: '2026-11-12T17:05:00.000Z',
              webLink: 'https://docs.google.com/document/d/doc-weekly-sync/edit',
              text: 'Suggested next steps\n[Francisco] Send the budget\n',
            },
            {
              id: 'doc-client-kickoff',
              title: 'Client kickoff - 2026/11/13 09:00 CST - Notes by Gemini',
              modifiedTime: '2026-11-13T16:20:00.000Z',
              webLink: 'https://docs.google.com/document/d/doc-client-kickoff/edit',
              text: 'Action items\nAna will share the contract\n',
            },
          ],
        },
      },
    ]);
  });

  it('leaves out a Doc whose name does not contain `Notes by Gemini`, even when Drive matches it ignoring case', async () => {
    const backendPosts: { url: string; body: unknown }[] = [];
    const files: DriveFile[] = [
      {
        id: 'doc-weekly-sync',
        name: 'Weekly sync - 2026/11/12 10:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-12T17:05:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-weekly-sync/edit',
        text: 'Suggested next steps\n[Francisco] Send the budget\n',
      },
      {
        id: 'doc-my-own-draft',
        name: 'Ideas for team notes by gemini rollout',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-13T16:20:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-my-own-draft/edit',
        text: 'Draft ideas\n',
      },
    ];

    await pollNotesOnce({
      fetch: driveFake(files, backendPosts),
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
    });

    const report = backendPosts[0]?.body as { docs: { id: string }[] };
    expect(report.docs.map((doc) => doc.id)).toEqual(['doc-weekly-sync']);
  });

  it("reports only the docs modified since the profile's last successful notes poll", async () => {
    const backendPosts: { url: string; body: unknown }[] = [];
    const files: DriveFile[] = [
      {
        id: 'doc-weekly-sync',
        name: 'Weekly sync - 2026/11/12 10:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-12T17:05:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-weekly-sync/edit',
        text: 'Suggested next steps\n[Francisco] Send the budget\n',
      },
      {
        id: 'doc-client-kickoff',
        name: 'Client kickoff - 2026/11/13 09:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-13T16:20:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-client-kickoff/edit',
        text: 'Action items\nAna will share the contract\n',
      },
    ];

    await pollNotesOnce({
      fetch: driveFake(files, backendPosts),
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      lastSuccessfulPollTime: '2026-11-13T08:00:00.000Z',
    });

    const report = backendPosts[0]?.body as { docs: { id: string }[] };
    expect(report.docs.map((doc) => doc.id)).toEqual(['doc-client-kickoff']);
  });

  it('keeps the since time when the backend refuses the notes report, so the next poll reports the docs the failed one carried', async () => {
    const backendPosts: { url: string; body: unknown }[] = [];
    const files: DriveFile[] = [
      {
        id: 'doc-weekly-sync',
        name: 'Weekly sync - 2026/11/12 10:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-12T17:05:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-weekly-sync/edit',
        text: 'Suggested next steps\n[Francisco] Send the budget\n',
      },
      {
        id: 'doc-client-kickoff',
        name: 'Client kickoff - 2026/11/13 09:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-13T16:20:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-client-kickoff/edit',
        text: 'Action items\nAna will share the contract\n',
      },
    ];
    const drive = driveFake(files, backendPosts);
    let reportsRefused = 0;
    const backendRefusingFirstReport = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (init?.method === 'POST' && reportsRefused === 0) {
        reportsRefused += 1;
        return Promise.resolve(new Response('backend unavailable', { status: 500 }));
      }
      return drive(input, init);
    };
    const pollOptions = {
      fetch: backendRefusingFirstReport,
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
    };

    const sinceAfterFailedPoll = await pollNotesOnce({
      ...pollOptions,
      lastSuccessfulPollTime: '2026-11-13T08:00:00.000Z',
    });
    await pollNotesOnce({ ...pollOptions, lastSuccessfulPollTime: sinceAfterFailedPoll });

    const report = backendPosts[0]?.body as { docs: { id: string }[] };
    expect(report.docs.map((doc) => doc.id)).toEqual(['doc-client-kickoff']);
  });

  it('leaves a doc whose export fails out of the report and logs it, and still reports the other docs of the same poll', async () => {
    const backendPosts: { url: string; body: unknown }[] = [];
    const files: DriveFile[] = [
      {
        id: 'doc-weekly-sync',
        name: 'Weekly sync - 2026/11/12 10:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-12T17:05:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-weekly-sync/edit',
        text: 'Suggested next steps\n[Francisco] Send the budget\n',
      },
      {
        id: 'doc-client-kickoff',
        name: 'Client kickoff - 2026/11/13 09:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-13T16:20:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-client-kickoff/edit',
        text: 'Action items\nAna will share the contract\n',
      },
    ];
    const drive = driveFake(files, backendPosts);
    const driveFailingOneExport = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === '/drive/v3/files/doc-weekly-sync/export') {
        return Promise.resolve(new Response('export size limit exceeded', { status: 403 }));
      }
      return drive(input, init);
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await pollNotesOnce({
        fetch: driveFailingOneExport,
        accessToken: 'token-for-francisco',
        accountEmail: 'francisco@example.com',
        backendUrl: 'http://127.0.0.1:7777',
      });

      const report = backendPosts[0]?.body as { docs: { id: string }[] };
      expect(report.docs.map((doc) => doc.id)).toEqual(['doc-client-kickoff']);
      const logged = consoleError.mock.calls.map((call) => call.map(String).join(' '));
      expect(logged).toEqual([expect.stringMatching(/doc-weekly-sync/)]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('logs a notes report the backend rejects, with its status', async () => {
    const backendPosts: { url: string; body: unknown }[] = [];
    const files: DriveFile[] = [
      {
        id: 'doc-weekly-sync',
        name: 'Weekly sync - 2026/11/12 10:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-12T17:05:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-weekly-sync/edit',
        text: 'Suggested next steps\n[Francisco] Send the budget\n',
      },
    ];
    const drive = driveFake(files, backendPosts);
    const backendRejectingReport = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (init?.method === 'POST') {
        return Promise.resolve(Response.json({ error: 'account not allowed' }, { status: 403 }));
      }
      return drive(input, init);
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await pollNotesOnce({
        fetch: backendRejectingReport,
        accessToken: 'token-for-francisco',
        accountEmail: 'francisco@example.com',
        backendUrl: 'http://127.0.0.1:7777',
      });

      const logged = consoleError.mock.calls.map((call) => call.map(String).join(' '));
      expect(logged).toEqual([expect.stringMatching(/francisco@example\.com.*403/)]);
    } finally {
      consoleError.mockRestore();
    }
  });
  it('still posts an empty notes report when the poll finds no docs modified since the last successful poll', async () => {
    const backendPosts: { url: string; body: unknown }[] = [];
    const files: DriveFile[] = [
      {
        id: 'doc-weekly-sync',
        name: 'Weekly sync - 2026/11/12 10:00 CST - Notes by Gemini',
        mimeType: googleDocMimeType,
        modifiedTime: '2026-11-12T17:05:00.000Z',
        webViewLink: 'https://docs.google.com/document/d/doc-weekly-sync/edit',
        text: 'Suggested next steps\n[Francisco] Send the budget\n',
      },
    ];

    await pollNotesOnce({
      fetch: driveFake(files, backendPosts),
      accessToken: 'token-for-francisco',
      accountEmail: 'francisco@example.com',
      backendUrl: 'http://127.0.0.1:7777',
      lastSuccessfulPollTime: '2026-11-13T08:00:00.000Z',
    });

    expect(backendPosts).toEqual([
      {
        url: 'http://127.0.0.1:7777/notes-report',
        body: { accountEmail: 'francisco@example.com', docs: [] },
      },
    ]);
  });
});
