import type { TaskProposal } from './task-proposals';

interface ProposalEvent {
  type: 'proposal-confirmed' | 'proposal-rejected';
  taskId: string;
  at: string;
  proposal: TaskProposal;
}

export type TaskEvent =
  | ProposalEvent
  | { type: 'done'; taskId: string; at: string }
  | { type: 'snoozed'; taskId: string; at: string; until: string };

export interface Task extends TaskProposal {
  id: string;
  status: 'open';
}

const hidesTask = (event: TaskEvent, now?: string): boolean => {
  if (event.type === 'done') return true;
  if (event.type !== 'snoozed' || now === undefined) return false;
  return Date.parse(event.until) > Date.parse(now);
};

export const openTasks = (events: TaskEvent[], now?: string): Task[] => {
  const hiddenTaskIds = events.filter((event) => hidesTask(event, now)).map((event) => event.taskId);
  return events
    .filter((event): event is ProposalEvent => event.type === 'proposal-confirmed')
    .map((event): Task => ({ id: event.taskId, ...event.proposal, status: 'open' }))
    .filter((task) => !hiddenTaskIds.includes(task.id));
};
