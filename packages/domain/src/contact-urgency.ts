import { businessDaysBetween } from './business-days';

interface ContactUrgencyInput {
  messages: { receivedAt: string }[];
  vip: boolean;
  now: string;
  settings: { timeZone: string; unansweredAskBusinessDays: number };
}

export function contactUrgency(input: ContactUrgencyInput): { urgent: boolean; reasons: string[] } {
  const { messages, now, settings } = input;
  const urgent = messages.some(
    (message) => businessDaysBetween(message.receivedAt, now, settings.timeZone) >= settings.unansweredAskBusinessDays,
  );
  return urgent ? { urgent: true, reasons: ['unanswered ask'] } : { urgent: false, reasons: [] };
}
