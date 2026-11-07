import { z } from 'zod';

const ccThreadExtract = z.strictObject({ sinceLastMessage: z.string() });
const actionExtract = z.object({ asker: z.string(), ask: z.string(), due: z.string().optional() });
const expenseExtract = z.object({ vendor: z.string(), amount: z.number(), currency: z.string(), date: z.string() });
const systemUpdateExtract = z.object({ system: z.string(), severity: z.string(), significant: z.boolean() });

const salesExtract = z.object({ company: z.string(), solution: z.string(), problem: z.string() });
const calendarDriveExtract = z.object({ item: z.string(), change: z.string() });
const unknownExtract = z.strictObject({});

const extractForCategory: Record<string, z.ZodType | undefined> = {
  action: actionExtract,
  'cc-thread': ccThreadExtract,
  expense: expenseExtract,
  'system-update': systemUpdateExtract,
  sales: salesExtract,
  'calendar-drive': calendarDriveExtract,
};

const extractMatchesCategory = (proposal: { category: string; extract: unknown }): boolean =>
  extractForCategory[proposal.category]?.safeParse(proposal.extract).success ?? true;

// What Claude returns for one email: the proposed action, its category, a summary, the category's extract and why.
export const triageProposal = z.object({
  action: z.enum(['archive', 'keep', 'act']),
  category: z.enum(['action', 'cc-thread', 'expense', 'system-update', 'sales', 'calendar-drive', 'unknown']),
  summary: z.string(),
  extract: z.union([ccThreadExtract, actionExtract, expenseExtract, systemUpdateExtract, salesExtract, calendarDriveExtract, unknownExtract]),
  reason: z.string(),
  taskDraft: z.object({ title: z.string() }).optional(),
}).refine(extractMatchesCategory);
