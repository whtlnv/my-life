import type { TaskProposal } from './task-proposals';

export type TaskEvent =
  | {
      type: 'proposal-confirmed' | 'proposal-rejected';
      taskId: string;
      at: string;
      proposal: TaskProposal;
    }
  | { type: 'done'; taskId: string; at: string };

export interface Task extends TaskProposal {
  id: string;
  status: 'open';
}

export const openTasks = (events: TaskEvent[]): Task[] => {
  const doneIds = events.filter((event) => event.type === 'done').map((event) => event.taskId);
  return events
    .filter((event): event is Extract<TaskEvent, { proposal: TaskProposal }> => event.type === 'proposal-confirmed')
    .map((event): Task => ({ id: event.taskId, ...event.proposal, status: 'open' }))
    .filter((task) => !doneIds.includes(task.id));
};
