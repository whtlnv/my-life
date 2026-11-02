export interface StartupSettings {
  allowedEmails: string[];
  port: number;
}

export function readStartupSettings(
  environment: Record<string, string | undefined>,
  _homeDirectory: string,
): StartupSettings {
  return {
    allowedEmails: parseAllowedEmails(environment.MY_LIFE_ALLOWED_EMAILS),
    port: parsePort(environment.MY_LIFE_PORT),
  };
}

function parsePort(portText: string | undefined): number {
  return Number(portText);
}

function parseAllowedEmails(commaSeparatedEmails: string | undefined): string[] {
  if (commaSeparatedEmails === undefined || commaSeparatedEmails.trim() === '') {
    return [];
  }
  return commaSeparatedEmails.split(',').map((email) => email.trim());
}
