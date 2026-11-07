import { describe, expect, it } from 'vitest';

import { accountName } from './account-name';

describe('accountName', () => {
  it('shortens an email to the first label of its domain, and leaves a bare name alone', () => {
    expect(accountName('franciscoc@psmutuus.com')).toBe('psmutuus');
    expect(accountName('it@icona.fun')).toBe('icona');
    expect(accountName('no-domain')).toBe('no-domain');
  });
});
