import type { TaskProposal } from './task-proposals';

export interface TaskEvent {
  type: 'proposal-confirmed' | 'proposal-rejected';
  taskId: string;
  at: string;
  proposal: TaskProposal;
}

export interface Task extends TaskProposal {
  id: string;
  status: 'open';
}

export const openTasks = (events: TaskEvent[]): Task[] =>
  events
    .filter((event) => event.type === 'proposal-confirmed')
    .map((event) => ({ id: event.taskId, ...event.proposal, status: 'open' }));
