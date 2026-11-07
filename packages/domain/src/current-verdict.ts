export function currentVerdict<V extends { decidedAt: string }>(verdicts: V[]): V | undefined {
  return verdicts.reduce((latest, verdict) =>
    Date.parse(verdict.decidedAt) > Date.parse(latest.decidedAt) ? verdict : latest,
  );
}
