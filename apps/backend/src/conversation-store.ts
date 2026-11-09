import { openDatabase } from './open-database';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  citations?: unknown[] | undefined;
}

function parseTurns(json: string): ConversationTurn[] {
  return JSON.parse(json) as ConversationTurn[];
}

export function openConversationStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS agent_conversations (id TEXT PRIMARY KEY, turns TEXT NOT NULL)');
  const saveConversation = database.prepare('INSERT OR REPLACE INTO agent_conversations (id, turns) VALUES (?, ?)');
  const loadConversation = database.prepare<[string], { turns: string }>(
    'SELECT turns FROM agent_conversations WHERE id = ?',
  );
  // INSERT OR REPLACE gives a saved row a new rowid, so rowid order is the order of last activity.
  const listConversations = database.prepare<[], { id: string; turns: string }>(
    'SELECT id, turns FROM agent_conversations ORDER BY rowid DESC',
  );
  const countConversations = database.prepare<[], { count: number }>(
    'SELECT COUNT(*) AS count FROM agent_conversations',
  );
  return {
    save(id: string, turns: ConversationTurn[]): void {
      saveConversation.run(id, JSON.stringify(turns));
    },
    load(id: string): ConversationTurn[] | undefined {
      const row = loadConversation.get(id);
      return row ? parseTurns(row.turns) : undefined;
    },
    listMostRecentlyActiveFirst(): [string, ConversationTurn[]][] {
      return listConversations.all().map((row) => [row.id, parseTurns(row.turns)]);
    },
    count(): number {
      return countConversations.get()?.count ?? 0;
    },
  };
}
