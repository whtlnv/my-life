import { vi } from 'vitest';

export const answerGetsWith = (bodies: Record<string, unknown>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const body = bodies[input];
      return Promise.resolve(
        body === undefined
          ? new Response(null, { status: 404 })
          : new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
      );
    }),
  );
};
