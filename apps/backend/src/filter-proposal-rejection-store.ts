import { openDatabase } from './open-database';

export function openFilterProposalRejectionStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS filter_proposal_rejections (proposal_id TEXT NOT NULL)');
  const saveRejection = database.prepare('INSERT INTO filter_proposal_rejections (proposal_id) VALUES (?)');
  const loadRejections = database.prepare<[], { proposal_id: string }>(
    'SELECT proposal_id FROM filter_proposal_rejections ORDER BY rowid',
  );
  return {
    save(proposalId: string): void {
      saveRejection.run(proposalId);
    },
    loadAll(): string[] {
      return loadRejections.all().map((row) => row.proposal_id);
    },
  };
}
