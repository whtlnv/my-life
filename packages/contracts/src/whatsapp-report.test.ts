import { describe, expect, it } from 'vitest';

import { whatsappReport } from './whatsapp-report';

function reportWithMessageId(id: string) {
  return {
    channel: 'whatsapp',
    chats: [{ title: 'Ana', unreadCount: 2, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
    openChat: {
      title: 'Ana',
      messages: [
        {
          id,
          sender: 'Ana',
          sentAt: '2026-11-10T09:41:00-06:00',
          text: 'Can we move the call to tomorrow?',
          sentByUser: false,
        },
      ],
    },
  };
}

describe('whatsappReport', () => {
  it('accepts a report with the chat list and the open chat messages', () => {
    const report = reportWithMessageId('3EB0A1B2C3D4E5F6');

    expect(whatsappReport.parse(report)).toEqual(report);
  });

  it('rejects a report whose message has no id', () => {
    expect(whatsappReport.safeParse(reportWithMessageId('')).success).toBe(false);
  });
});
