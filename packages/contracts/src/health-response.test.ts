import { describe, expect, it } from 'vitest';

import { healthResponse } from './health-response';

describe('healthResponse', () => {
  it('accepts the healthy answer', () => {
    expect(healthResponse.parse({ ok: true })).toEqual({ ok: true });
  });

  it('rejects an answer that is not healthy', () => {
    expect(healthResponse.safeParse({ ok: false }).success).toBe(false);
  });
});
