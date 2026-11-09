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
  | { type: 'snoozed'; taskId: string; at: string; until: string }
  | { type: 'waiting-on'; taskId: string; at: string; person: string };

export interface Task extends TaskProposal {
  id: string;
  status: 'open';
  waitingOn?: string;
}

const hidesTask = (event: TaskEvent, now?: string): boolean => {
  if (event.type === 'done') return true;
  if (event.type !== 'snoozed' || now === undefined) return false;
  return Date.parse(event.until) > Date.parse(now);
};

const waitingOnPerson = (events: TaskEvent[], taskId: string): string | undefined =>
  events.find(
    (event): event is Extract<TaskEvent, { type: 'waiting-on' }> =>
      event.type === 'waiting-on' && event.taskId === taskId,
  )?.person;

export const openTasks = (events: TaskEvent[], now?: string): Task[] => {
  const hiddenTaskIds = events.filter((event) => hidesTask(event, now)).map((event) => event.taskId);
  return events
    .filter((event): event is ProposalEvent => event.type === 'proposal-confirmed')
    .map((event): Task => {
      const waitingOn = waitingOnPerson(events, event.taskId);
      return { id: event.taskId, ...event.proposal, status: 'open', ...(waitingOn && { waitingOn }) };
    })
    .filter((task) => !hiddenTaskIds.includes(task.id));
};
