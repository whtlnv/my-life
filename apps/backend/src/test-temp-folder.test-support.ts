import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Vitest global setup: every temp folder a test makes (its SQLite stores, prompt files) lands in one folder per run,
// removed when the run ends. Without it each run left ~600 `my-life-*` folders behind (16.7 GB by 2026-11-08).
export default function useOneTempFolderPerRun(): () => void {
  const runFolder = mkdtempSync(join(tmpdir(), 'my-life-test-run-'));
  process.env.TMPDIR = runFolder;
  return () => {
    rmSync(runFolder, { recursive: true, force: true });
  };
}
