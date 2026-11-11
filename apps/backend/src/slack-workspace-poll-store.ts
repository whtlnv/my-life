import { openDatabase } from './open-database';

export function openSlackWorkspacePollStore<Polls>(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS slack_workspace_polls (polls TEXT NOT NULL)');
  const savePolls = database.prepare('INSERT INTO slack_workspace_polls (polls) VALUES (?)');
  const loadLatestPolls = database.prepare<[], { polls: string }>(
    'SELECT polls FROM slack_workspace_polls ORDER BY rowid DESC LIMIT 1',
  );
  return {
    save(polls: Polls): void {
      savePolls.run(JSON.stringify(polls));
    },
    loadLatest(): Polls | undefined {
      const row = loadLatestPolls.get();
      return row === undefined ? undefined : (JSON.parse(row.polls) as Polls);
    },
  };
}
