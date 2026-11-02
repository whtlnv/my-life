export interface StartupSettings {
  allowedEmails: string[];
}

export function readStartupSettings(
  environment: Record<string, string | undefined>,
  _homeDirectory: string,
): StartupSettings {
  return { allowedEmails: (environment.MY_LIFE_ALLOWED_EMAILS ?? '').split(',') };
}
