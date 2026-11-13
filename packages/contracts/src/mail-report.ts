import { z } from 'zod';

const mailMessage = z.object({
  id: z.string(),
  threadId: z.string(),
  from: z.string().default(''),
  to: z.string().default(''),
  cc: z.string().optional(),
  subject: z.string().default(''),
  date: z.string().default(''),
  snippet: z.string(),
  listId: z.string().optional(),
  body: z.string().optional(),
});

// What the extension in one Chrome profile posts to the backend after reading that account's Gmail history.
export const mailReport = z.object({
  accountEmail: z.string(),
  historyId: z.string(),
  messages: z.array(mailMessage),
});
