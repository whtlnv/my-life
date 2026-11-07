import { isAccountFresh } from './account-freshness';
import type { Clock } from './clock';

export interface SourceReport {
  email: string;
  source: 'mail' | 'calendar';
  lastReportedAt: string;
}

export function describeSourceFreshness(
  sources: readonly SourceReport[],
  pollingIntervalsInMilliseconds: Record<SourceReport['source'], number>,
  clock: Clock,
) {
  return sources.map((report) => ({
    ...report,
    stale: !isAccountFresh(
      {
        email: report.email,
        lastReportedAt: report.lastReportedAt,
        pollingIntervalInMilliseconds: pollingIntervalsInMilliseconds[report.source],
      },
      clock,
    ),
  }));
}
