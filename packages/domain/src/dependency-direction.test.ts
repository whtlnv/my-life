import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The "delete the apps" rule (CLAUDE.md § Architecture): the domain must compile and pass with every apps/* package
// gone, so nothing in it may import an app, a framework, a database driver or Node's own I/O modules.
const sourceFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });

const forbidden = /from ['"](@my-life\/(backend|dashboard|extension)|node:|react|hono|better-sqlite3|wxt)/;

describe('dependency direction', () => {
  it('the domain imports no app, framework, driver or Node I/O module', () => {
    const offenders = sourceFiles(path.join(import.meta.dirname, '.')).filter((file) =>
      forbidden.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('the domain package declares no runtime dependency on an app', () => {
    const manifest = JSON.parse(readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith('@my-life/'))).toEqual([]);
  });
});
