import { isAccountFresh } from './account-freshness';
import type { Clock } from './clock';

export interface SourceReport {
  email: string;
  source: 'mail' | 'calendar' | 'notes';
  lastReportedAt: string;
}

export function describeSourceFreshness<Source extends SourceReport['source']>(
  sources: readonly (SourceReport & { source: Source })[],
  pollingIntervalsInMilliseconds: Record<Source, number>,
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
