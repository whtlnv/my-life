type MessageSource = { messageId: string; accountEmail: string };
type TaskDraft = { title: string };
type CompanyExtract = { company: string };
type Verdict = { decision: string; correction?: { action: string; taskDraft?: TaskDraft } };

export const triageEffects = (
  proposal: MessageSource & {
    action: string;
    category?: string;
    taskDraft?: TaskDraft;
    extract?: CompanyExtract;
  },
  verdict: Verdict | undefined,
): {
  archives: MessageSource[];
  tasks: (TaskDraft & MessageSource)[];
  checkLater?: (CompanyExtract & MessageSource)[];
} => {
  const source = { messageId: proposal.messageId, accountEmail: proposal.accountEmail };
  const confirmed = verdict?.decision === 'confirmed';
  const decidedAction = verdict?.correction?.action ?? (confirmed ? proposal.action : undefined);
  const taskDraft = verdict?.correction?.taskDraft ?? proposal.taskDraft;
  return {
    archives: decidedAction === 'archive' ? [source] : [],
    tasks: decidedAction === 'act' && taskDraft ? [{ title: taskDraft.title, ...source }] : [],
    ...(proposal.category === 'sales' &&
      proposal.extract && { checkLater: [{ company: proposal.extract.company, ...source }] }),
  };
};
