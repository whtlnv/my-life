export const triageEffects = (
  proposal: { messageId: string; accountEmail: string; action: string; taskDraft?: { title: string } },
  verdict: { decision: string; correction?: { action: string; taskDraft: { title: string } } } | undefined,
): {
  archives: { messageId: string; accountEmail: string }[];
  tasks: { title: string; messageId: string; accountEmail: string }[];
} => {
  const source = { messageId: proposal.messageId, accountEmail: proposal.accountEmail };
  const confirmed = verdict?.decision === 'confirmed';
  const taskDraft = verdict?.correction?.taskDraft ?? proposal.taskDraft;
  return {
    archives: proposal.action === 'archive' && confirmed ? [source] : [],
    tasks: taskDraft ? [{ title: taskDraft.title, ...source }] : [],
  };
};
