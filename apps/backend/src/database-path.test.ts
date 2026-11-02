import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDatabasePath } from './database-path';

describe('database path', () => {
  it('places the database file under ~/Library/Application Support/my-life/ when no path is configured', () => {
    const databasePath = resolveDatabasePath(undefined, '/Users/ana');

    expect(dirname(databasePath)).toBe(join('/Users/ana', 'Library', 'Application Support', 'my-life'));
  });
});
