export function chooseVerdictExamples<V extends { from: string; category: string; decidedAt: string }>(
  message: { from: string; category?: string },
  verdicts: V[],
  limit: number,
): V[] {
  const messageDomain = senderDomain(message.from);
  const fromSender = newestFirst(verdicts.filter((verdict) => verdict.from === message.from));
  const fromSenderDomain = newestFirst(
    verdicts.filter((verdict) => verdict.from !== message.from && senderDomain(verdict.from) === messageDomain),
  );
  const ofSameCategory = newestFirst(
    verdicts.filter((verdict) => senderDomain(verdict.from) !== messageDomain && verdict.category === message.category),
  );
  return [...fromSender, ...fromSenderDomain, ...ofSameCategory].slice(0, limit);
}

function senderDomain(from: string): string {
  return from.slice(from.lastIndexOf('@') + 1).replace('>', '');
}

function newestFirst<V extends { decidedAt: string }>(verdicts: V[]): V[] {
  return [...verdicts].sort((first, second) => Date.parse(second.decidedAt) - Date.parse(first.decidedAt));
}
