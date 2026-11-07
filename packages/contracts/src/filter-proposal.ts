import { z } from 'zod';

export const filterProposal = z.object({
  criteria: z
    .object({ from: z.string().optional(), subject: z.string().optional(), listId: z.string().optional() })
    .refine((criteria) => Object.keys(criteria).length > 0),
  labelName: z.string(),
  skipInbox: z.boolean(),
});
