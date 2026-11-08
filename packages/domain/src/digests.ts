export interface Digest<Proposal> {
  readonly key: string | undefined;
  readonly category: string;
  readonly proposals: readonly Proposal[];
  readonly severityCounts: Readonly<Record<string, number>>;
  readonly significantItems: readonly Proposal[];
}

type DigestableExtract =
  { readonly system: string } | { readonly company: string } | { readonly item: string; readonly change: string };

interface DigestableProposal {
  readonly accountEmail: string;
  readonly category: string;
  readonly from?: string;
  readonly extract: DigestableExtract | object;
}

const digestedCategories = new Set(['system-update', 'sales', 'calendar-drive']);

export function isDigestedCategory(category: string | undefined): boolean {
  return category !== undefined && digestedCategories.has(category);
}

function isDigestable(proposal: DigestableProposal): boolean {
  return isDigestedCategory(proposal.category);
}

function digestKey(proposal: DigestableProposal): string | undefined {
  return 'system' in proposal.extract ? proposal.extract.system : senderAddress(proposal.from);
}

function severityCounts(proposals: readonly DigestableProposal[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { extract } of proposals) {
    if ('severity' in extract && typeof extract.severity === 'string') {
      counts[extract.severity] = (counts[extract.severity] ?? 0) + 1;
    }
  }
  return counts;
}

function isSignificant({ extract }: DigestableProposal): boolean {
  return 'significant' in extract && extract.significant === true;
}

function senderAddress(from: string | undefined): string | undefined {
  return from?.match(/<([^>]+)>/)?.[1] ?? from;
}

export function digests<Proposal extends DigestableProposal>(proposals: readonly Proposal[]): Digest<Proposal>[] {
  const byAccountCategoryAndKey = new Map<
    string,
    { key: string | undefined; category: string; proposals: Proposal[] }
  >();
  for (const proposal of proposals.filter(isDigestable)) {
    const key = digestKey(proposal);
    const groupKey = JSON.stringify([proposal.accountEmail, proposal.category, key]);
    const group = byAccountCategoryAndKey.get(groupKey) ?? { key, category: proposal.category, proposals: [] };
    group.proposals.push(proposal);
    byAccountCategoryAndKey.set(groupKey, group);
  }
  return [...byAccountCategoryAndKey.values()].map((group) => ({
    ...group,
    severityCounts: severityCounts(group.proposals),
    significantItems: group.proposals.filter(isSignificant),
  }));
}
