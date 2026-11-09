import { businessDaysBetween, localCalendarDate } from './business-days';

interface UrgencyMessage {
  threadId: string;
  receivedAt: string;
  sentByUser: boolean;
  onlyMentionsContact?: boolean;
  dates?: string[];
  asks?: { ask: string }[];
}

export interface UrgencySettings {
  timeZone: string;
  unansweredAskBusinessDays: number;
  deadlineHours: number;
  vipWaitingBusinessDays: number;
}

interface ContactUrgencyInput {
  messages: UrgencyMessage[];
  vip: boolean;
  now: string;
  settings: UrgencySettings;
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
  const hasOwnDeadlineSoon = (message: UrgencyMessage) =>
    !message.onlyMentionsContact && hasDeadlineSoon(message, now, settings.deadlineHours, settings.timeZone);
  const isUnansweredAsk = (message: UrgencyMessage) =>
    asksSomething(message) &&
    waitingForReplyAtLeast(message, messages, now, settings.timeZone, settings.unansweredAskBusinessDays);
  const isWaitingAsVip = (message: UrgencyMessage) =>
    waitingForReplyAtLeast(message, messages, now, settings.timeZone, settings.vipWaitingBusinessDays);
  const reasons: string[] = [];
  if (messages.some(hasOwnDeadlineSoon)) {
    reasons.push('deadline');
  }
  if (input.vip && messages.some(isWaitingAsVip)) {
    reasons.push('VIP waiting');
  }
  if (messages.some(isUnansweredAsk)) {
    reasons.push('unanswered ask');
  }
  return { urgent: reasons.length > 0, reasons };
}
