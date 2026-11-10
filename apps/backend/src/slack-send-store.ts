import { openDatabase } from './open-database';

export function openSlackSendStore<Send>(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS slack_sends (send TEXT NOT NULL)');
  const saveSend = database.prepare('INSERT INTO slack_sends (send) VALUES (?)');
  const loadSends = database.prepare<[], { send: string }>('SELECT send FROM slack_sends ORDER BY rowid');
  return {
    save(send: Send): void {
      saveSend.run(JSON.stringify(send));
    },
    loadAll(): Send[] {
      return loadSends.all().map((row) => JSON.parse(row.send) as Send);
    },
  };
}
