import { businessDaysBetween } from './business-days';

interface UrgencyMessage {
  threadId: string;
  receivedAt: string;
  sentByUser: boolean;
}

interface ContactUrgencyInput {
  messages: UrgencyMessage[];
  vip: boolean;
  now: string;
  settings: { timeZone: string; unansweredAskBusinessDays: number };
}

function answeredByUser(message: UrgencyMessage, messages: UrgencyMessage[]): boolean {
  return messages.some(
    (reply) => reply.sentByUser && reply.threadId === message.threadId && reply.receivedAt > message.receivedAt,
  );
}

export function contactUrgency(input: ContactUrgencyInput): { urgent: boolean; reasons: string[] } {
  const { messages, now, settings } = input;
  const urgent = messages.some(
    (message) =>
      !message.sentByUser &&
      !answeredByUser(message, messages) &&
      businessDaysBetween(message.receivedAt, now, settings.timeZone) >= settings.unansweredAskBusinessDays,
  );
  return urgent ? { urgent: true, reasons: ['unanswered ask'] } : { urgent: false, reasons: [] };
}
