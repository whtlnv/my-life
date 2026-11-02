import type { Clock } from './clock';

export interface AccountReport {
  email: string;
  lastReportedAt: string;
  pollingIntervalInMilliseconds: number;
}

export function isAccountFresh(_account: AccountReport, _clock: Clock): boolean {
  return true;
}
