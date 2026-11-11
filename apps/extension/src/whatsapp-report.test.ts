// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { whatsappReport } from '@my-life/contracts';
import { describe, expect, it } from 'vitest';

import { parseWhatsappChatList } from './whatsapp-page-parser';
import { buildWhatsappReport } from './whatsapp-report';

const fixtureDocument = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(new URL(fileName, import.meta.url), 'utf8'), 'text/html');

describe('buildWhatsappReport', () => {
  it('builds, from the saved one-to-one chat fixture, a report that passes the shared contract schema', () => {
    const report = buildWhatsappReport(fixtureDocument('whatsapp-one-to-one-chat.fixture.html'));

    expect(whatsappReport.safeParse(report).success).toBe(true);
  });

  it("builds, from the fixture document, a report whose chats keep each chat's last-message preview through the shared contract schema", () => {
    const document = fixtureDocument('whatsapp-one-to-one-chat.fixture.html');

    const report = whatsappReport.parse(buildWhatsappReport(document));

    expect(report.chats.map((chat) => chat.lastMessagePreview)).toEqual(
      parseWhatsappChatList(document).map(({ lastMessagePreview }) => lastMessagePreview),
    );
  });
});
