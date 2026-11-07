import { z } from 'zod';

const mailMessage = z.object({
  id: z.string(),
  threadId: z.string(),
  from: z.string(),
  to: z.string(),
  cc: z.string().optional(),
  subject: z.string(),
  date: z.string(),
  snippet: z.string(),
  listId: z.string(),
});

// What the extension in one Chrome profile posts to the backend after reading that account's Gmail history.
export const mailReport = z.object({
  accountEmail: z.string(),
  historyId: z.string(),
  messages: z.array(mailMessage),
});
