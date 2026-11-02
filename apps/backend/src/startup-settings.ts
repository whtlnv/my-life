export interface StartupSettings {
  allowedEmails: string[];
}

export function readStartupSettings(
  environment: Record<string, string | undefined>,
  _homeDirectory: string,
): StartupSettings {
  const allowedEmails = environment.MY_LIFE_ALLOWED_EMAILS;
  return { allowedEmails: allowedEmails === undefined || allowedEmails.trim() === '' ? [] : allowedEmails.split(',').map((email) => email.trim()) };
}
