import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolveDatabasePath } from './database-path';
import { readStartupSettings } from './startup-settings';

describe('startup settings', () => {
  it('reads the allowed emails as a comma-separated list from MY_LIFE_ALLOWED_EMAILS', () => {
    const settings = readStartupSettings(
      { MY_LIFE_ALLOWED_EMAILS: 'ana@example.com,ana@work.example.com' },
      '/Users/ana',
    );

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

  it('uses port 8123 when MY_LIFE_PORT is 8123', () => {
    const settings = readStartupSettings({ MY_LIFE_PORT: '8123' }, '/Users/ana');

    expect(settings.port).toBe(8123);
  });

  it('uses port 7777 when MY_LIFE_PORT is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.port).toBe(7777);
  });

  it('uses the Application Support database path when MY_LIFE_DATABASE_PATH is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.databasePath).toBe(resolveDatabasePath(undefined, '/Users/ana'));
  });

  it('uses /tmp/elsewhere.sqlite as the database path when MY_LIFE_DATABASE_PATH is /tmp/elsewhere.sqlite', () => {
    const settings = readStartupSettings({ MY_LIFE_DATABASE_PATH: '/tmp/elsewhere.sqlite' }, '/Users/ana');

    expect(settings.databasePath).toBe('/tmp/elsewhere.sqlite');
  });

  it("uses the dashboard package's dist folder as the dashboard directory when MY_LIFE_DASHBOARD_DIRECTORY is unset", () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.dashboardDirectory).toBe(fileURLToPath(new URL('../../dashboard/dist', import.meta.url)));
  });

  it('uses /tmp/elsewhere-dist as the dashboard directory when MY_LIFE_DASHBOARD_DIRECTORY is /tmp/elsewhere-dist', () => {
    const settings = readStartupSettings({ MY_LIFE_DASHBOARD_DIRECTORY: '/tmp/elsewhere-dist' }, '/Users/ana');

    expect(settings.dashboardDirectory).toBe('/tmp/elsewhere-dist');
  });

  it('polls Gmail every 60 seconds when MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.gmailPollingIntervalInMilliseconds).toBe(60_000);
  });

  it('polls Gmail every 90 seconds when MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS is 90', () => {
    const settings = readStartupSettings({ MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS: '90' }, '/Users/ana');

    expect(settings.gmailPollingIntervalInMilliseconds).toBe(90_000);
  });

  it('triages with claude-opus-5-5 when MY_LIFE_TRIAGE_MODEL is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.triageModel).toBe('claude-opus-5-5');
  });

  it('triages with claude-sonnet-5-5 when MY_LIFE_TRIAGE_MODEL is claude-sonnet-5-5', () => {
    const settings = readStartupSettings({ MY_LIFE_TRIAGE_MODEL: 'claude-sonnet-5-5' }, '/Users/ana');

    expect(settings.triageModel).toBe('claude-sonnet-5-5');
  });

  it('caps daily triage spend at USD 20 when MY_LIFE_DAILY_SPEND_CEILING_USD is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.dailySpendCeilingInUsd).toBe(20);
  });

  it('caps daily triage spend at USD 35 when MY_LIFE_DAILY_SPEND_CEILING_USD is 35', () => {
    const settings = readStartupSettings({ MY_LIFE_DAILY_SPEND_CEILING_USD: '35' }, '/Users/ana');

    expect(settings.dailySpendCeilingInUsd).toBe(35);
  });

  it('refuses to start triage and names ANTHROPIC_API_KEY as the reason when the key is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.triage).toEqual({ enabled: false, reason: expect.stringContaining('ANTHROPIC_API_KEY') });
  });

  it('enables triage with no reason when ANTHROPIC_API_KEY is set', () => {
    const settings = readStartupSettings({ ANTHROPIC_API_KEY: 'sk-ant-test-key' }, '/Users/ana');

    expect(settings.triage).toEqual({ enabled: true });
  });
});
