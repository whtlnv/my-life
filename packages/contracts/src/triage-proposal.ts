import { z } from 'zod';

const ccThreadExtract = z.strictObject({ sinceLastMessage: z.string() });
const actionExtract = z.object({ asker: z.string(), ask: z.string() });

const extractMatchesCategory = (proposal: { category: string; extract: unknown }): boolean =>
  proposal.category !== 'action' || actionExtract.safeParse(proposal.extract).success;

// What Claude returns for one email: the proposed action, its category, a summary, the category's extract and why.
export const triageProposal = z.object({
  action: z.enum(['archive', 'keep', 'act']),
  category: z.enum(['action', 'cc-thread', 'expense', 'system-update', 'sales', 'calendar-drive', 'unknown']),
  summary: z.string(),
  extract: z.union([ccThreadExtract, actionExtract]),
  reason: z.string(),
  taskDraft: z.object({ title: z.string() }).optional(),
}).refine(extractMatchesCategory);
