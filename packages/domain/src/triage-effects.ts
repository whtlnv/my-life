export const triageEffects = (
  proposal: { messageId: string; accountEmail: string; action: string },
  verdict: { decision: string } | undefined,
): { archives: { messageId: string; accountEmail: string }[] } => ({
  archives:
    proposal.action === 'archive' && verdict?.decision === 'confirmed'
      ? [{ messageId: proposal.messageId, accountEmail: proposal.accountEmail }]
      : [],
});
