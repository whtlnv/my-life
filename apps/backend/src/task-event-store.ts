import type { TaskEvent } from '@my-life/domain';

import { openDatabase } from './open-database';

export function openTaskEventStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS task_events (event TEXT NOT NULL)');
  const saveEvent = database.prepare('INSERT INTO task_events (event) VALUES (?)');
  const loadEvents = database.prepare<[], { event: string }>('SELECT event FROM task_events ORDER BY rowid');
  return {
    save(event: TaskEvent): void {
      saveEvent.run(JSON.stringify(event));
    },
    loadAll(): TaskEvent[] {
      return loadEvents.all().map((row) => JSON.parse(row.event) as TaskEvent);
    },
  };
}
