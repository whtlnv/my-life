import { describe, expect, it } from 'vitest';

import { readStartupSettings } from './startup-settings';

describe('startup settings', () => {
  it('reads the allowed emails as a comma-separated list from MY_LIFE_ALLOWED_EMAILS', () => {
    const settings = readStartupSettings({ MY_LIFE_ALLOWED_EMAILS: 'ana@example.com,ana@work.example.com' }, '/Users/ana');

    expect(settings.allowedEmails).toEqual(['ana@example.com', 'ana@work.example.com']);
  });
});
