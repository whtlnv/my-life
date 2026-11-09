import { localCalendarDate } from './business-days';
import type { Clock } from './clock';

interface SpendEntry {
  loggedAt: string;
  costInUsd: number;
}

interface SpendSettings {
  dailyCeilingInUsd: number;
  timeZone: string;
}

export function isTriagePaused(spendLog: SpendEntry[], settings: SpendSettings, clock: Clock): boolean {
  const today = localCalendarDate(clock.now(), settings.timeZone);
  const spentInUsd = spendLog
    .filter((entry) => localCalendarDate(new Date(entry.loggedAt), settings.timeZone) === today)
    .reduce((total, entry) => total + entry.costInUsd, 0);
  return spentInUsd >= settings.dailyCeilingInUsd;
}
