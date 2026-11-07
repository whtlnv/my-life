import { openDatabase } from './open-database';

interface StoredFilterProposal {
  accountEmail: string;
  messageIds: string[];
  promptVersion: string;
  proposedAt: string;
  proposal: unknown;
}

export function openFilterProposalStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS filter_proposals (account_email TEXT NOT NULL, message_ids TEXT NOT NULL, prompt_version TEXT NOT NULL, proposed_at TEXT NOT NULL, proposal TEXT NOT NULL, candidate_key TEXT NOT NULL)',
  );
  const saveProposal = database.prepare(
    'INSERT INTO filter_proposals (account_email, message_ids, prompt_version, proposed_at, proposal, candidate_key) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const loadProposals = database.prepare<
    [],
    { account_email: string; message_ids: string; prompt_version: string; proposed_at: string; proposal: string }
  >('SELECT account_email, message_ids, prompt_version, proposed_at, proposal FROM filter_proposals ORDER BY rowid');
  const loadCandidateKeys = database.prepare<[], { candidate_key: string }>(
    'SELECT candidate_key FROM filter_proposals',
  );
  return {
    save(stored: StoredFilterProposal, candidateKey: string): void {
      saveProposal.run(
        stored.accountEmail,
        JSON.stringify(stored.messageIds),
        stored.promptVersion,
        stored.proposedAt,
        JSON.stringify(stored.proposal),
        candidateKey,
      );
    },
    loadCandidateKeys(): string[] {
      return loadCandidateKeys.all().map((row) => row.candidate_key);
    },
    loadAll(): StoredFilterProposal[] {
      return loadProposals.all().map((row) => ({
        accountEmail: row.account_email,
        messageIds: JSON.parse(row.message_ids) as string[],
        promptVersion: row.prompt_version,
        proposedAt: row.proposed_at,
        proposal: JSON.parse(row.proposal) as unknown,
      }));
    },
  };
}
