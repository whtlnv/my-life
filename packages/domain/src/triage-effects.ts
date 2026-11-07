export const triageEffects = (
  proposal: { messageId: string; accountEmail: string; action: string },
  verdict:
    | { decision: string; correction?: { action: string; taskDraft: { title: string } } }
    | undefined,
): {
  archives: { messageId: string; accountEmail: string }[];
  tasks: { title: string; messageId: string; accountEmail: string }[];
} => ({
  archives:
    proposal.action === 'archive' && verdict?.decision === 'confirmed'
      ? [{ messageId: proposal.messageId, accountEmail: proposal.accountEmail }]
      : [],
  tasks: verdict?.correction
    ? [
        {
          title: verdict.correction.taskDraft.title,
          messageId: proposal.messageId,
          accountEmail: proposal.accountEmail,
        },
      ]
    : [],
});
