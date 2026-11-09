import { z } from 'zod';

// The rank and reason the prioritization model gives each task through its rank_tasks tool.
export const taskRanks = z.object({
  ranks: z.array(z.object({ taskId: z.string(), rank: z.number(), reason: z.string() })),
});

export type TaskRanks = z.infer<typeof taskRanks>;
