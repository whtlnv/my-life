import { describe, expect, it } from 'vitest';

import { backendUrl, defaultBackendUrl } from './backend-url';

describe('backendUrl', () => {
  it('falls back to the local backend when nothing is configured', () => {
    expect(backendUrl(undefined)).toBe(defaultBackendUrl);
    expect(backendUrl('')).toBe(defaultBackendUrl);
  });

  it('keeps a configured address, without a trailing slash', () => {
    expect(backendUrl('http://127.0.0.1:9999/')).toBe('http://127.0.0.1:9999');
  });
});
