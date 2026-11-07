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
}

const defaultPort = 7777;
const millisecondsPerSecond = 1000;
const defaultGmailPollingIntervalInMilliseconds = 60_000;
const defaultTriageModel = 'claude-opus-5-5';
const defaultDailySpendCeilingInUsd = 20;
const defaultDashboardDirectory = fileURLToPath(new URL('../../dashboard/dist', import.meta.url));

export function readStartupSettings(
  environment: Record<string, string | undefined>,
  homeDirectory: string,
): StartupSettings {
  return {
    allowedEmails: parseAllowedEmails(environment.MY_LIFE_ALLOWED_EMAILS),
    port: parsePort(environment.MY_LIFE_PORT),
    databasePath: resolveDatabasePath(environment.MY_LIFE_DATABASE_PATH, homeDirectory),
    dashboardDirectory: environment.MY_LIFE_DASHBOARD_DIRECTORY ?? defaultDashboardDirectory,
    gmailPollingIntervalInMilliseconds: parseGmailPollingInterval(
      environment.MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS,
    ),
    triageModel: environment.MY_LIFE_TRIAGE_MODEL ?? defaultTriageModel,
    dailySpendCeilingInUsd: defaultDailySpendCeilingInUsd,
  };
}

function parseGmailPollingInterval(intervalSecondsText: string | undefined): number {
  if (intervalSecondsText === undefined) {
    return defaultGmailPollingIntervalInMilliseconds;
  }
  return Number(intervalSecondsText) * millisecondsPerSecond;
}

function parsePort(portText: string | undefined): number {
  if (portText === undefined) {
    return defaultPort;
  }
  return Number(portText);
}

function parseAllowedEmails(commaSeparatedEmails: string | undefined): string[] {
  if (commaSeparatedEmails === undefined || commaSeparatedEmails.trim() === '') {
    return [];
  }
  return commaSeparatedEmails.split(',').map((email) => email.trim());
}
