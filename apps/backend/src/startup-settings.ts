import { fileURLToPath } from 'node:url';

import { resolveDatabasePath } from './database-path';

export interface StartupSettings {
  allowedEmails: string[];
  databasePath: string;
  dashboardDirectory: string;
  port: number;
  gmailPollingIntervalInMilliseconds: number;
  triageModel: string;
  dailySpendCeilingInUsd: number;
  triage: { enabled: false; reason: string };
}

const defaultPort = 7777;
const millisecondsPerSecond = 1000;
const defaultGmailPollingIntervalInSeconds = 60;
const defaultTriageModel = 'claude-opus-5-5';
const defaultDailySpendCeilingInUsd = 20;
const defaultDashboardDirectory = fileURLToPath(new URL('../../dashboard/dist', import.meta.url));

export function readStartupSettings(
  environment: Record<string, string | undefined>,
  homeDirectory: string,
): StartupSettings {
  return {
    allowedEmails: parseAllowedEmails(environment.MY_LIFE_ALLOWED_EMAILS),
    port: parseNumberOrDefault(environment.MY_LIFE_PORT, defaultPort),
    databasePath: resolveDatabasePath(environment.MY_LIFE_DATABASE_PATH, homeDirectory),
    dashboardDirectory: environment.MY_LIFE_DASHBOARD_DIRECTORY ?? defaultDashboardDirectory,
    gmailPollingIntervalInMilliseconds: secondsToMilliseconds(
      parseNumberOrDefault(environment.MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS, defaultGmailPollingIntervalInSeconds),
    ),
    triageModel: environment.MY_LIFE_TRIAGE_MODEL ?? defaultTriageModel,
    dailySpendCeilingInUsd: parseNumberOrDefault(
      environment.MY_LIFE_DAILY_SPEND_CEILING_USD,
      defaultDailySpendCeilingInUsd,
    ),
    triage: { enabled: false, reason: 'ANTHROPIC_API_KEY is not set' },
  };
}

function secondsToMilliseconds(seconds: number): number {
  return seconds * millisecondsPerSecond;
}

function parseNumberOrDefault(numberText: string | undefined, defaultValue: number): number {
  if (numberText === undefined) {
    return defaultValue;
  }
  return Number(numberText);
}

function parseAllowedEmails(commaSeparatedEmails: string | undefined): string[] {
  if (commaSeparatedEmails === undefined || commaSeparatedEmails.trim() === '') {
    return [];
  }
  return commaSeparatedEmails.split(',').map((email) => email.trim());
}
