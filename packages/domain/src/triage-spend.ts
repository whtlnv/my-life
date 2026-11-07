import type { Clock } from './clock';

interface SpendEntry {
  loggedAt: string;
  costInUsd: number;
}

interface SpendSettings {
  dailyCeilingInUsd: number;
  timeZone: string;
}

export function isTriagePaused(spendLog: SpendEntry[], settings: SpendSettings, _clock: Clock): boolean {
  const spentInUsd = spendLog.reduce((total, entry) => total + entry.costInUsd, 0);
  return spentInUsd >= settings.dailyCeilingInUsd;
}
