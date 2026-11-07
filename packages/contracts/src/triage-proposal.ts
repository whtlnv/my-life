import { z } from 'zod';

// What Claude returns for one email: the proposed action, its category, a summary, the category's extract and why.
export const triageProposal = z.object({
  action: z.string(),
  category: z.enum(['action', 'cc-thread', 'expense', 'system-update', 'sales', 'calendar-drive', 'unknown']),
  summary: z.string(),
  extract: z.object({ sinceLastMessage: z.string() }),
  reason: z.string(),
});
