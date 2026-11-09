import { fileURLToPath } from 'node:url';

import { contactUrgency } from '@my-life/domain';
import { describe, expect, it } from 'vitest';

import { resolveDatabasePath } from './database-path';
import { readStartupSettings } from './startup-settings';

describe('startup settings', () => {
  it.each([
    {
      rule: 'reads the allowed emails as a comma-separated list from MY_LIFE_ALLOWED_EMAILS',
      environment: { MY_LIFE_ALLOWED_EMAILS: 'ana@example.com,ana@work.example.com' },
      allowedEmails: ['ana@example.com', 'ana@work.example.com'],
    },
    {
      rule: 'has an empty allow-list when MY_LIFE_ALLOWED_EMAILS is unset',
      environment: {},
      allowedEmails: [],
    },
    {
      rule: 'has an empty allow-list when MY_LIFE_ALLOWED_EMAILS is blank',
      environment: { MY_LIFE_ALLOWED_EMAILS: '   ' },
      allowedEmails: [],
    },
    {
      rule: 'trims surrounding spaces around each email in MY_LIFE_ALLOWED_EMAILS',
      environment: { MY_LIFE_ALLOWED_EMAILS: '  ana@example.com , ana@work.example.com  ' },
      allowedEmails: ['ana@example.com', 'ana@work.example.com'],
    },
  ])('$rule', ({ environment, allowedEmails }) => {
    const settings = readStartupSettings(environment, '/Users/ana');

    expect(settings.allowedEmails).toEqual(allowedEmails);
  });

  it.each([
    { rule: 'reads the port as a number from MY_LIFE_PORT', environment: { MY_LIFE_PORT: '4321' }, port: 4321 },
    { rule: 'uses port 8123 when MY_LIFE_PORT is 8123', environment: { MY_LIFE_PORT: '8123' }, port: 8123 },
    { rule: 'uses port 7777 when MY_LIFE_PORT is unset', environment: {}, port: 7777 },
  ])('$rule', ({ environment, port }) => {
    const settings = readStartupSettings(environment, '/Users/ana');

    expect(settings.port).toBe(port);
  });

  it.each([
    {
      rule: 'uses the Application Support database path when MY_LIFE_DATABASE_PATH is unset',
      environment: {},
      setting: 'databasePath',
      expected: resolveDatabasePath(undefined, '/Users/ana'),
    },
    {
      rule: 'uses /tmp/elsewhere.sqlite as the database path when MY_LIFE_DATABASE_PATH is /tmp/elsewhere.sqlite',
      environment: { MY_LIFE_DATABASE_PATH: '/tmp/elsewhere.sqlite' },
      setting: 'databasePath',
      expected: '/tmp/elsewhere.sqlite',
    },
    {
      rule: "uses the dashboard package's dist folder as the dashboard directory when MY_LIFE_DASHBOARD_DIRECTORY is unset",
      environment: {},
      setting: 'dashboardDirectory',
      expected: fileURLToPath(new URL('../../dashboard/dist', import.meta.url)),
    },
    {
      rule: 'uses /tmp/elsewhere-dist as the dashboard directory when MY_LIFE_DASHBOARD_DIRECTORY is /tmp/elsewhere-dist',
      environment: { MY_LIFE_DASHBOARD_DIRECTORY: '/tmp/elsewhere-dist' },
      setting: 'dashboardDirectory',
      expected: '/tmp/elsewhere-dist',
    },
    {
      rule: 'polls Gmail every 60 seconds when MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS is unset',
      environment: {},
      setting: 'gmailPollingIntervalInMilliseconds',
      expected: 60_000,
    },
    {
      rule: 'polls Gmail every 90 seconds when MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS is 90',
      environment: { MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS: '90' },
      setting: 'gmailPollingIntervalInMilliseconds',
      expected: 90_000,
    },
    {
      rule: 'triages with claude-haiku-5-5 when MY_LIFE_TRIAGE_MODEL is unset',
      environment: {},
      setting: 'triageModel',
      expected: 'claude-haiku-5-5',
    },
    {
      rule: 'triages with claude-sonnet-5-5 when MY_LIFE_TRIAGE_MODEL is claude-sonnet-5-5',
      environment: { MY_LIFE_TRIAGE_MODEL: 'claude-sonnet-5-5' },
      setting: 'triageModel',
      expected: 'claude-sonnet-5-5',
    },
    {
      rule: 'writes digest summaries with claude-haiku-5-5 when MY_LIFE_SUMMARY_MODEL is unset',
      environment: {},
      setting: 'summaryModel',
      expected: 'claude-haiku-5-5',
    },
    {
      rule: 'prioritizes with claude-sonnet-5-5 when MY_LIFE_PRIORITIZATION_MODEL is claude-sonnet-5-5',
      environment: { MY_LIFE_PRIORITIZATION_MODEL: 'claude-sonnet-5-5' },
      setting: 'prioritizationModel',
      expected: 'claude-sonnet-5-5',
    },
    {
      rule: 'caps daily triage spend at USD 20 when MY_LIFE_DAILY_SPEND_CEILING_USD is unset',
      environment: {},
      setting: 'dailySpendCeilingInUsd',
      expected: 20,
    },
    {
      rule: 'caps daily triage spend at USD 35 when MY_LIFE_DAILY_SPEND_CEILING_USD is 35',
      environment: { MY_LIFE_DAILY_SPEND_CEILING_USD: '35' },
      setting: 'dailySpendCeilingInUsd',
      expected: 35,
    },
  ] as const)('$rule', ({ environment, setting, expected }) => {
    const settings = readStartupSettings(environment, '/Users/ana');

    expect(settings[setting]).toBe(expected);
  });

  it('refuses to start triage and names ANTHROPIC_API_KEY as the reason when the key is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.triage).toEqual({
      enabled: false,
      reason: expect.stringContaining('ANTHROPIC_API_KEY') as unknown,
    });
  });

  it('enables triage with no reason when ANTHROPIC_API_KEY is set', () => {
    const settings = readStartupSettings({ ANTHROPIC_API_KEY: 'sk-ant-test-key' }, '/Users/ana');

    expect(settings.triage).toEqual({ enabled: true });
  });
  it.each([
    {
      rule: 'triages with Haiku first and escalates to Opus when nothing is configured',
      environment: {},
      triageModel: 'claude-haiku-5-5',
      escalationModel: 'claude-opus-5-5',
    },
    {
      rule: 'reads the first and the escalation model from MY_LIFE_TRIAGE_MODEL and MY_LIFE_TRIAGE_ESCALATION_MODEL',
      environment: { MY_LIFE_TRIAGE_MODEL: 'claude-sonnet-5-5', MY_LIFE_TRIAGE_ESCALATION_MODEL: 'claude-opus-5-5' },
      triageModel: 'claude-sonnet-5-5',
      escalationModel: 'claude-opus-5-5',
    },
    {
      rule: 'runs one model for everything when MY_LIFE_TRIAGE_ESCALATION_MODEL is none',
      environment: { MY_LIFE_TRIAGE_MODEL: 'claude-opus-5-5', MY_LIFE_TRIAGE_ESCALATION_MODEL: 'none' },
      triageModel: 'claude-opus-5-5',
      escalationModel: undefined,
    },
  ])('$rule', ({ environment, triageModel, escalationModel }) => {
    const settings = readStartupSettings(environment, '/Users/ana');

    expect({ triageModel: settings.triageModel, escalationModel: settings.triageEscalationModel }).toEqual({
      triageModel,
      escalationModel,
    });
  });

  it('makes a contact with a 1-business-day-old unanswered ask urgent when MY_LIFE_UNANSWERED_ASK_BUSINESS_DAYS is 1', () => {
    const settings = readStartupSettings({ MY_LIFE_UNANSWERED_ASK_BUSINESS_DAYS: '1' }, '/Users/ana');
    const mondayFivePm = '2026-11-09T23:00:00.000Z';
    const tuesdayFivePm = '2026-11-10T23:00:00.000Z';
    const messages = [
      {
        threadId: 'thread-budget',
        receivedAt: mondayFivePm,
        sentByUser: false,
        asks: [{ ask: 'Review the Q3 budget spreadsheet and send comments' }],
      },
    ];

    expect(contactUrgency({ messages, vip: false, now: tuesdayFivePm, settings: settings.urgency })).toEqual({
      urgent: true,
      reasons: ['unanswered ask'],
    });
  });
});
