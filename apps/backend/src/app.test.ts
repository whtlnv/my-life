import { describe, expect, it } from 'vitest';

import { healthResponse } from '@my-life/contracts';

import { createApp } from './app';

describe('backend app', () => {
  it('answers GET /health with the healthy answer', async () => {
    const response = await createApp().request('/health');

    expect(response.status).toBe(200);
    expect(healthResponse.parse(await response.json())).toEqual({ ok: true });
  });
});
