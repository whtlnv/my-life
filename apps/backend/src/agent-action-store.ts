import { openDatabase } from './open-database';

export interface StoredAgentAction {
  id: string;
  tool: string;
  target: string;
  conversationId: string;
  at: string;
  undoable: boolean;
  undone?: boolean;
  labelName?: string;
  outcome?: 'refused';
}

export function openAgentActionStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS agent_actions (id TEXT NOT NULL, action TEXT NOT NULL)');
  database.exec('CREATE TABLE IF NOT EXISTS agent_action_undos (action_id TEXT NOT NULL)');
  const saveAction = database.prepare('INSERT INTO agent_actions (id, action) VALUES (?, ?)');
  const saveUndo = database.prepare('INSERT INTO agent_action_undos (action_id) VALUES (?)');
  const loadActions = database.prepare<[], { action: string }>('SELECT action FROM agent_actions ORDER BY rowid');
  const loadUndos = database.prepare<[], { action_id: string }>('SELECT action_id FROM agent_action_undos');
  return {
    save(action: StoredAgentAction): void {
      saveAction.run(action.id, JSON.stringify(action));
    },
    markUndone(actionId: string): void {
      saveUndo.run(actionId);
    },
    loadAll(): StoredAgentAction[] {
      const undoneIds = loadUndos.all().map((row) => row.action_id);
      return loadActions.all().map((row) => {
        const action = JSON.parse(row.action) as StoredAgentAction;
        return undoneIds.includes(action.id) ? { ...action, undone: true } : action;
      });
    },
  };
}
