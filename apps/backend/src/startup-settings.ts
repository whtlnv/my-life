export interface StartupSettings {
  allowedEmails: string[];
  port: number;
}

export function readStartupSettings(
  environment: Record<string, string | undefined>,
  _homeDirectory: string,
): StartupSettings {
  return { allowedEmails: parseAllowedEmails(environment.MY_LIFE_ALLOWED_EMAILS), port: 4321 };
}

function parseAllowedEmails(commaSeparatedEmails: string | undefined): string[] {
  if (commaSeparatedEmails === undefined || commaSeparatedEmails.trim() === '') {
    return [];
  }
  return commaSeparatedEmails.split(',').map((email) => email.trim());
}
