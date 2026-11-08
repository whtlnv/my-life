import { z } from 'zod';

export const triageCategories = [
  'action',
  'cc-thread',
  'expense',
  'system-update',
  'sales',
  'calendar-drive',
  'unknown',
] as const;

const ccThreadExtract = z.strictObject({ sinceLastMessage: z.string() });
const actionExtract = z.object({ asker: z.string(), ask: z.string(), due: z.string().optional() });
const expenseExtract = z.object({ vendor: z.string(), amount: z.number(), currency: z.string(), date: z.string() });
const systemUpdateExtract = z.object({ system: z.string(), severity: z.string(), significant: z.boolean() });

const salesExtract = z.object({ company: z.string(), solution: z.string(), problem: z.string() });
const calendarDriveExtract = z.object({ item: z.string(), change: z.string() });
const unknownExtract = z.strictObject({});

const person = z.object({
  name: z.string(),
  email: z.string().optional(),
  role: z.enum(['sender', 'asked', 'mentioned', 'copied']),
});
const ask = z.object({ ask: z.string(), due: z.string().optional() });
const commitment = z.object({ who: z.string(), commitment: z.string() });

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
export const triageProposal = z
  .object({
    action: z.enum(['archive', 'keep', 'act']),
    category: z.enum(triageCategories),
    summary: z.string(),
    extract: z.union([
      ccThreadExtract,
      actionExtract,
      expenseExtract,
      systemUpdateExtract,
      salesExtract,
      calendarDriveExtract,
      unknownExtract,
    ]),
    reason: z.string(),
    taskDraft: z.object({ title: z.string() }).optional(),
    people: z.array(person).optional(),
    organization: z.string().optional(),
    asks: z.array(ask).optional(),
    commitments: z.array(commitment).optional(),
    dates: z.array(z.string()).optional(),
    threadState: z.string().optional(),
  })
  .refine(extractMatchesCategory);
