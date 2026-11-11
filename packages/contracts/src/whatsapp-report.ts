import { z } from 'zod';

const whatsappChat = z.object({
  title: z.string(),
  unreadCount: z.number(),
  lastMessageAt: z.string(),
});

const whatsappMessage = z.object({
  id: z.string(),
  sender: z.string(),
  sentAt: z.string(),
  text: z.string(),
  sentByUser: z.boolean(),
});

// What the WhatsApp content script posts to the backend: the chat list and the open chat's messages.
export const whatsappReport = z.object({
  channel: z.literal('whatsapp'),
  chats: z.array(whatsappChat),
  openChat: z.object({
    title: z.string(),
    messages: z.array(whatsappMessage),
  }),
});
