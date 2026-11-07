export const triageEffects = (
  proposal: { messageId: string; accountEmail: string; action: string },
  verdict: { decision: string; correction?: { action: string; taskDraft: { title: string } } } | undefined,
): {
  archives: { messageId: string; accountEmail: string }[];
  tasks: { title: string; messageId: string; accountEmail: string }[];
} => {
  const source = { messageId: proposal.messageId, accountEmail: proposal.accountEmail };
  return {
    archives: proposal.action === 'archive' && verdict?.decision === 'confirmed' ? [source] : [],
    tasks: verdict?.correction ? [{ title: verdict.correction.taskDraft.title, ...source }] : [],
  };
};
