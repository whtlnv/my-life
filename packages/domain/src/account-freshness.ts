import type { Clock } from './clock';

export interface AccountReport {
  email: string;
  lastReportedAt: string;
  pollingIntervalInMilliseconds: number;
}

export function isAccountFresh(account: AccountReport, clock: Clock): boolean {
  const millisecondsSinceLastReport =
    clock.now().getTime() - new Date(account.lastReportedAt).getTime();
  return millisecondsSinceLastReport <= 2 * account.pollingIntervalInMilliseconds;
}
