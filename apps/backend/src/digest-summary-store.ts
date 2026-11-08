import { openDatabase } from './open-database';

export function openDigestSummaryStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS digest_summaries (digest_id TEXT PRIMARY KEY, summary_lines TEXT)');
  const saveSummary = database.prepare(
    'INSERT OR REPLACE INTO digest_summaries (digest_id, summary_lines) VALUES (?, ?)',
  );
  const loadSummary = database.prepare<[string], { summary_lines: string | null }>(
    'SELECT summary_lines FROM digest_summaries WHERE digest_id = ?',
  );
  return {
    save(digestId: string, summaryLines: string[] | undefined): void {
      saveSummary.run(digestId, summaryLines === undefined ? null : JSON.stringify(summaryLines));
    },
    load(digestId: string): string[] | undefined {
      const row = loadSummary.get(digestId);
      return row?.summary_lines ? (JSON.parse(row.summary_lines) as string[]) : undefined;
    },
  };
}
