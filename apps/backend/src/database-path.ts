import { join } from 'node:path';

export function resolveDatabasePath(configuredPath: string | undefined, homeDirectory: string): string {
  return configuredPath ?? join(homeDirectory, 'Library', 'Application Support', 'my-life', 'my-life.sqlite');
}
