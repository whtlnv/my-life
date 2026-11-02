import { fileURLToPath } from 'node:url';

import { resolveDatabasePath } from './database-path';

export interface StartupSettings {
  allowedEmails: string[];
  databasePath: string;
  dashboardDirectory: string;
  port: number;
}

const defaultPort = 7777;

export function readStartupSettings(
  environment: Record<string, string | undefined>,
  homeDirectory: string,
): StartupSettings {
  return {
    allowedEmails: parseAllowedEmails(environment.MY_LIFE_ALLOWED_EMAILS),
    port: parsePort(environment.MY_LIFE_PORT),
    databasePath: resolveDatabasePath(environment.MY_LIFE_DATABASE_PATH, homeDirectory),
    dashboardDirectory: fileURLToPath(new URL('../../dashboard/dist', import.meta.url)),
  };
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
