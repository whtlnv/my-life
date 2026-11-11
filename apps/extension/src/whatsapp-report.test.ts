// @vitest-environment jsdom
import { whatsappReport } from '@my-life/contracts';
import { describe, expect, it } from 'vitest';

import { parseWhatsappChatList } from './whatsapp-page-parser';
import { buildWhatsappReport } from './whatsapp-report';
import { fixtureDocument } from './whatsapp-fixture-document';

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

  it("names the open chat by the title in the conversation header, so its messages are stored under that chat", () => {
    const report = buildWhatsappReport(fixtureDocument('whatsapp-group-chat.fixture.html'));

    expect(report.openChat.title).toBe('aaaaaaaaa aaaaaaaaaaa aaaaaa');
  });
});
