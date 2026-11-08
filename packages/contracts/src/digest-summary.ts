import { z } from 'zod';

// The one or two lines the summary model writes for a digest through its write_summary tool.
export const digestSummary = z.object({ lines: z.array(z.string().min(1)).min(1).max(2) });
