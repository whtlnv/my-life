import type { Clock } from './clock';

interface SpendEntry {
  loggedAt: string;
  costInUsd: number;
}

interface SpendSettings {
  dailyCeilingInUsd: number;
  timeZone: string;
}

export function isTriagePaused(_spendLog: SpendEntry[], _settings: SpendSettings, _clock: Clock): boolean {
  return true;
}
