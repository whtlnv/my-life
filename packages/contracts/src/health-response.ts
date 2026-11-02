import { z } from 'zod';

// What the backend answers on GET /health: the extension and the dashboard use it to tell "backend down" from
// "backend up, nothing to show".
export const healthResponse = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof healthResponse>;
