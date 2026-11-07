import { openDatabase } from './open-database';

export function openFilterProposalApprovalStore(databasePath: string) {
  const database = openDatabase(databasePath);
  database.exec(
    'CREATE TABLE IF NOT EXISTS filter_proposal_approvals (proposal_id TEXT NOT NULL, approved_at TEXT NOT NULL)',
  );
  const saveApproval = database.prepare(
    'INSERT INTO filter_proposal_approvals (proposal_id, approved_at) VALUES (?, ?)',
  );
  const loadApprovals = database.prepare<[], { proposal_id: string; approved_at: string }>(
    'SELECT proposal_id, approved_at FROM filter_proposal_approvals ORDER BY rowid',
  );
  return {
    save(proposalId: string, approvedAt: string): void {
      saveApproval.run(proposalId, approvedAt);
    },
    loadAll(): { proposalId: string; approvedAt: string }[] {
      return loadApprovals.all().map((row) => ({ proposalId: row.proposal_id, approvedAt: row.approved_at }));
    },
    loadApprovedProposalIds(): string[] {
      return loadApprovals.all().map((row) => row.proposal_id);
    },
  };
}
