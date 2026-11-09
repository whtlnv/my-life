import { businessDaysBetween, localCalendarDate } from './business-days';

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

function asksSomething(message: UrgencyMessage): boolean {
  return (message.asks ?? []).length > 0;
}

const isDateOnly = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date);

// A date-only deadline ("2026-11-09", as the extraction may give it) lasts until the end of that day in the business
// time zone; one with a time is an instant.
function hasDeadlineSoon(message: UrgencyMessage, now: string, deadlineHours: number, timeZone: string): boolean {
  const deadlineWindowMilliseconds = deadlineHours * 60 * 60 * 1000;
  const nowMilliseconds = Date.parse(now);
  return (message.dates ?? []).some((date) => {
    if (isDateOnly(date)) {
      const today = localCalendarDate(nowMilliseconds, timeZone);
      const windowEnd = localCalendarDate(nowMilliseconds + deadlineWindowMilliseconds, timeZone);
      return date >= today && date <= windowEnd;
    }
    const millisecondsUntilDate = Date.parse(date) - nowMilliseconds;
    return millisecondsUntilDate >= 0 && millisecondsUntilDate <= deadlineWindowMilliseconds;
  });
}

export function contactUrgency(input: ContactUrgencyInput): { urgent: boolean; reasons: string[] } {
  const { messages, now, settings } = input;
  if (messages.some((message) => hasDeadlineSoon(message, now, settings.deadlineHours, settings.timeZone))) {
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
      asksSomething(message) &&
      waitingForReplyAtLeast(message, messages, now, settings.timeZone, settings.unansweredAskBusinessDays),
  );
  return urgent ? { urgent: true, reasons: ['unanswered ask'] } : { urgent: false, reasons: [] };
}
