import { openDatabase } from './open-database';

export function openDigestSummaryStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS digest_summaries (digest_id TEXT PRIMARY KEY, summary_lines TEXT)');
  const saveSummary = database.prepare(
    'INSERT OR REPLACE INTO digest_summaries (digest_id, summary_lines) VALUES (?, ?)',
  );
  database.exec(
    'CREATE TABLE IF NOT EXISTS digest_summary_rewrite (id INTEGER PRIMARY KEY CHECK (id = 1), needed INTEGER)',
  );
  const saveRewriteNeeded = database.prepare(
    'INSERT OR REPLACE INTO digest_summary_rewrite (id, needed) VALUES (1, ?)',
  );
  const loadRewriteNeeded = database.prepare<[], { needed: number }>(
    'SELECT needed FROM digest_summary_rewrite WHERE id = 1',
  );
  const loadSummary = database.prepare<[string], { summary_lines: string | null }>(
    'SELECT summary_lines FROM digest_summaries WHERE digest_id = ?',
  );
  return {
    // Whether a verdict has been given since the summaries were last rewritten; kept across restarts.
    markRewriteNeeded(needed: boolean): void {
      saveRewriteNeeded.run(needed ? 1 : 0);
    },
    isRewriteNeeded(): boolean {
      return loadRewriteNeeded.get()?.needed === 1;
    },
    save(digestId: string, summaryLines: string[] | undefined): void {
      saveSummary.run(digestId, summaryLines === undefined ? null : JSON.stringify(summaryLines));
    },
    load(digestId: string): string[] | undefined {
      const row = loadSummary.get(digestId);
      return row?.summary_lines ? (JSON.parse(row.summary_lines) as string[]) : undefined;
    },
  };
}
