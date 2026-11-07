export function chooseVerdictExamples<V extends { from: string; decidedAt: string }>(
  message: { from: string },
  verdicts: V[],
  limit: number,
): V[] {
  return verdicts
    .filter((verdict) => verdict.from === message.from)
    .sort((first, second) => Date.parse(second.decidedAt) - Date.parse(first.decidedAt))
    .slice(0, limit);
}
