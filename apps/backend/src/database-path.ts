import { join } from 'node:path';

export function resolveDatabasePath(_configuredPath: string | undefined, homeDirectory: string): string {
  return join(homeDirectory, 'Library', 'Application Support', 'my-life', 'my-life.sqlite');
}
