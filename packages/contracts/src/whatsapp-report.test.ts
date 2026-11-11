import { describe, expect, it } from 'vitest';

import { whatsappReport } from './whatsapp-report';

describe('whatsappReport', () => {
  it('accepts a report with the chat list and the open chat messages', () => {
    const report = {
      channel: 'whatsapp',
      chats: [{ title: 'Ana', unreadCount: 2, lastMessageAt: '2026-11-10T09:41:00-06:00' }],
      openChat: {
        title: 'Ana',
        messages: [
          {
            id: '3EB0A1B2C3D4E5F6',
            sender: 'Ana',
            sentAt: '2026-11-10T09:41:00-06:00',
            text: 'Can we move the call to tomorrow?',
            sentByUser: false,
          },
        ],
      },
    };

    expect(whatsappReport.parse(report)).toEqual(report);
  });
});
