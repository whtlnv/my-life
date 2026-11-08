import { businessDaysBetween } from './business-days';

interface UrgencyMessage {
  threadId: string;
  receivedAt: string;
  sentByUser: boolean;
  dates?: string[];
  asks?: { ask: string }[];
}

interface ContactUrgencyInput {
  messages: UrgencyMessage[];
  vip: boolean;
  now: string;
  settings: {
    timeZone: string;
    unansweredAskBusinessDays: number;
    deadlineHours: number;
    vipWaitingBusinessDays: number;
  };
}

function answeredByUser(message: UrgencyMessage, messages: UrgencyMessage[]): boolean {
  return messages.some(
    (reply) => reply.sentByUser && reply.threadId === message.threadId && reply.receivedAt > message.receivedAt,
  );
}

function waitingForReplyAtLeast(
  message: UrgencyMessage,
  messages: UrgencyMessage[],
  now: string,
  timeZone: string,
  businessDays: number,
): boolean {
  return (
    !message.sentByUser &&
    !answeredByUser(message, messages) &&
    businessDaysBetween(message.receivedAt, now, timeZone) >= businessDays
  );
}

function hasDeadlineSoon(message: UrgencyMessage, now: string, deadlineHours: number): boolean {
  const deadlineWindowMilliseconds = deadlineHours * 60 * 60 * 1000;
  return (message.dates ?? []).some((date) => Date.parse(date) - Date.parse(now) <= deadlineWindowMilliseconds);
}

export function contactUrgency(input: ContactUrgencyInput): { urgent: boolean; reasons: string[] } {
  const { messages, now, settings } = input;
  if (messages.some((message) => hasDeadlineSoon(message, now, settings.deadlineHours))) {
    return { urgent: true, reasons: ['deadline'] };
  }
  if (
    input.vip &&
    messages.some((message) =>
      waitingForReplyAtLeast(message, messages, now, settings.timeZone, settings.vipWaitingBusinessDays),
    )
  ) {
    return { urgent: true, reasons: ['VIP waiting'] };
  }
  const urgent = messages.some(
    (message) =>
      (message.asks ?? []).length > 0 &&
      waitingForReplyAtLeast(message, messages, now, settings.timeZone, settings.unansweredAskBusinessDays),
  );
  return urgent ? { urgent: true, reasons: ['unanswered ask'] } : { urgent: false, reasons: [] };
}
