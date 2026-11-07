export function chooseVerdictExamples<V extends { from: string; category: string; decidedAt: string }>(
  message: { from: string; category?: string },
  verdicts: V[],
  limit: number,
): V[] {
  const fromSender = newestFirst(verdicts.filter((verdict) => verdict.from === message.from));
  const ofSameCategory = newestFirst(
    verdicts.filter((verdict) => verdict.from !== message.from && verdict.category === message.category),
  );
  return [...fromSender, ...ofSameCategory].slice(0, limit);
}

function newestFirst<V extends { decidedAt: string }>(verdicts: V[]): V[] {
  return [...verdicts].sort((first, second) => Date.parse(second.decidedAt) - Date.parse(first.decidedAt));
}
