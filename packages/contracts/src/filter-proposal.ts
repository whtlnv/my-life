import { z } from 'zod';

export const filterProposal = z.object({
  criteria: z.object({ from: z.string(), subject: z.string(), listId: z.string() }),
  labelName: z.string(),
  skipInbox: z.boolean(),
});
