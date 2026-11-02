import { describe, expect, it } from 'vitest';

import { readStartupSettings } from './startup-settings';

describe('startup settings', () => {
  it('reads the allowed emails as a comma-separated list from MY_LIFE_ALLOWED_EMAILS', () => {
    const settings = readStartupSettings({ MY_LIFE_ALLOWED_EMAILS: 'ana@example.com,ana@work.example.com' }, '/Users/ana');

    expect(settings.allowedEmails).toEqual(['ana@example.com', 'ana@work.example.com']);
  });

  it('has an empty allow-list when MY_LIFE_ALLOWED_EMAILS is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.allowedEmails).toEqual([]);
  });

  it('has an empty allow-list when MY_LIFE_ALLOWED_EMAILS is blank', () => {
    const settings = readStartupSettings({ MY_LIFE_ALLOWED_EMAILS: '   ' }, '/Users/ana');

    expect(settings.allowedEmails).toEqual([]);
  });

  it('trims surrounding spaces around each email in MY_LIFE_ALLOWED_EMAILS', () => {
    const settings = readStartupSettings(
      { MY_LIFE_ALLOWED_EMAILS: '  ana@example.com , ana@work.example.com  ' },
      '/Users/ana',
    );

    expect(settings.allowedEmails).toEqual(['ana@example.com', 'ana@work.example.com']);
  });

  it('reads the port as a number from MY_LIFE_PORT', () => {
    const settings = readStartupSettings({ MY_LIFE_PORT: '4321' }, '/Users/ana');

    expect(settings.port).toBe(4321);
  });
});
