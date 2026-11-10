import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('runs the agent on claude-opus-5-5 when MY_LIFE_AGENT_MODEL is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.agentModel).toBe('claude-opus-5-5');
  });

  it('runs the agent on claude-sonnet-5-5 when MY_LIFE_AGENT_MODEL is claude-sonnet-5-5', () => {
    const settings = readStartupSettings({ MY_LIFE_AGENT_MODEL: 'claude-sonnet-5-5' }, '/Users/ana');

    expect(settings.agentModel).toBe('claude-sonnet-5-5');
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

  it('lists each Slack workspace with its team id and user token from MY_LIFE_SLACK_WORKSPACE_1_* and MY_LIFE_SLACK_WORKSPACE_2_*', () => {
    const settings = readStartupSettings(
      {
        MY_LIFE_SLACK_WORKSPACE_1_TEAM_ID: 'T0001',
        MY_LIFE_SLACK_WORKSPACE_1_USER_TOKEN: 'xoxp-first',
        MY_LIFE_SLACK_WORKSPACE_2_TEAM_ID: 'T0002',
        MY_LIFE_SLACK_WORKSPACE_2_USER_TOKEN: 'xoxp-second',
      },
      '/Users/ana',
    );

    expect(settings.slackWorkspaces).toEqual([
      { teamId: 'T0001', userToken: 'xoxp-first' },
      { teamId: 'T0002', userToken: 'xoxp-second' },
    ]);
  });

  it('leaves a Slack workspace out when it has a team id but no user token', () => {
    const settings = readStartupSettings(
      {
        MY_LIFE_SLACK_WORKSPACE_1_TEAM_ID: 'T0001',
        MY_LIFE_SLACK_WORKSPACE_1_USER_TOKEN: 'xoxp-first',
        MY_LIFE_SLACK_WORKSPACE_2_TEAM_ID: 'T0002',
      },
      '/Users/ana',
    );

    expect(settings.slackWorkspaces).toEqual([{ teamId: 'T0001', userToken: 'xoxp-first' }]);
  });

  it('polls Slack every 60 seconds when MY_LIFE_SLACK_POLLING_INTERVAL_SECONDS is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.slackPollingIntervalInMilliseconds).toBe(60_000);
  });

  it('polls Slack every 30 seconds when MY_LIFE_SLACK_POLLING_INTERVAL_SECONDS is 30', () => {
    const settings = readStartupSettings({ MY_LIFE_SLACK_POLLING_INTERVAL_SECONDS: '30' }, '/Users/ana');

    expect(settings.slackPollingIntervalInMilliseconds).toBe(30_000);
  });

  it('calls the Slack API at https://slack.com/api when MY_LIFE_SLACK_API_URL is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.slackApiUrl).toBe('https://slack.com/api');
  });

  it('calls the Slack API at MY_LIFE_SLACK_API_URL when it is set', () => {
    const settings = readStartupSettings({ MY_LIFE_SLACK_API_URL: 'http://localhost:4100/api' }, '/Users/ana');

    expect(settings.slackApiUrl).toBe('http://localhost:4100/api');
  });

  it('turns Telegram on when the API id, the API hash and a session file are all present', () => {
    const folder = mkdtempSync(join(tmpdir(), 'my-life-'));
    const sessionPath = join(folder, 'telegram-session');
    writeFileSync(sessionPath, 'saved-session');
    try {
      const settings = readStartupSettings(
        {
          MY_LIFE_TELEGRAM_API_ID: '12345',
          MY_LIFE_TELEGRAM_API_HASH: 'abcdef0123456789',
          MY_LIFE_TELEGRAM_SESSION_PATH: sessionPath,
        },
        '/Users/ana',
      );

      expect(settings.telegram).toEqual({
        enabled: true,
        apiId: 12345,
        apiHash: 'abcdef0123456789',
        sessionPath,
      });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it.each([
    {
      missing: 'the session file is missing',
      present: 'the API id and hash set',
      environment: { MY_LIFE_TELEGRAM_API_ID: '12345', MY_LIFE_TELEGRAM_API_HASH: 'abcdef0123456789' },
      sessionFileExists: false,
    },
    {
      missing: 'the API hash is missing',
      present: 'the API id and a session file',
      environment: { MY_LIFE_TELEGRAM_API_ID: '12345' },
      sessionFileExists: true,
    },
    {
      missing: 'the API id is missing',
      present: 'the API hash and a session file',
      environment: { MY_LIFE_TELEGRAM_API_HASH: 'api-hash' },
      sessionFileExists: true,
    },
  ])('turns Telegram off when $missing, even with $present', ({ environment, sessionFileExists }) => {
    const folder = mkdtempSync(join(tmpdir(), 'my-life-'));
    const sessionPath = join(folder, 'telegram-session');
    if (sessionFileExists) writeFileSync(sessionPath, 'saved-session');
    try {
      const settings = readStartupSettings(
        { ...environment, MY_LIFE_TELEGRAM_SESSION_PATH: sessionPath },
        '/Users/ana',
      );

      expect(settings.telegram.enabled).toBe(false);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('keeps the Telegram session at ~/Library/Application Support/my-life/telegram-session when MY_LIFE_TELEGRAM_SESSION_PATH is unset', () => {
    const settings = readStartupSettings({}, '/Users/ana');

    expect(settings.telegram.sessionPath).toBe('/Users/ana/Library/Application Support/my-life/telegram-session');
  });

  it('keeps the Telegram session at MY_LIFE_TELEGRAM_SESSION_PATH when it is set', () => {
    const settings = readStartupSettings(
      { MY_LIFE_TELEGRAM_SESSION_PATH: '/Volumes/vault/telegram.session' },
      '/Users/ana',
    );

    expect(settings.telegram.sessionPath).toBe('/Volumes/vault/telegram.session');
  });
});
