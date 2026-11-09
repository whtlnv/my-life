import type { TaskRanks } from '@my-life/contracts';

import { openDatabase } from './open-database';

interface StoredPin {
  taskId: string;
  pinned: boolean;
}

export function openPrioritizationStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS prioritization_runs (ranks TEXT NOT NULL)');
  database.exec('CREATE TABLE IF NOT EXISTS task_pins (task_id TEXT NOT NULL, pinned INTEGER NOT NULL)');
  const saveRanks = database.prepare('INSERT INTO prioritization_runs (ranks) VALUES (?)');
  const loadLatestRanks = database.prepare<[], { ranks: string }>(
    'SELECT ranks FROM prioritization_runs ORDER BY rowid DESC LIMIT 1',
  );
  const savePin = database.prepare('INSERT INTO task_pins (task_id, pinned) VALUES (?, ?)');
  const loadPins = database.prepare<[], { task_id: string; pinned: number }>(
    'SELECT task_id, pinned FROM task_pins ORDER BY rowid',
  );
  return {
    saveRanks(ranks: TaskRanks['ranks']): void {
      saveRanks.run(JSON.stringify(ranks));
    },
    loadLatestRanks(): TaskRanks['ranks'] {
      const row = loadLatestRanks.get();
      return row === undefined ? [] : (JSON.parse(row.ranks) as TaskRanks['ranks']);
    },
    savePin(pin: StoredPin): void {
      savePin.run(pin.taskId, pin.pinned ? 1 : 0);
    },
    loadPins(): StoredPin[] {
      return loadPins.all().map((row) => ({ taskId: row.task_id, pinned: row.pinned === 1 }));
    },
  };
}
