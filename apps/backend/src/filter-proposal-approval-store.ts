import { openDatabase } from './open-database';

export function openFilterProposalApprovalStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS filter_proposal_approvals (proposal_id TEXT NOT NULL)');
  const saveApproval = database.prepare('INSERT INTO filter_proposal_approvals (proposal_id) VALUES (?)');
  const loadApprovals = database.prepare<[], { proposal_id: string }>(
    'SELECT proposal_id FROM filter_proposal_approvals ORDER BY rowid',
  );
  return {
    save(proposalId: string): void {
      saveApproval.run(proposalId);
    },
    loadAll(): string[] {
      return loadApprovals.all().map((row) => row.proposal_id);
    },
  };
}
