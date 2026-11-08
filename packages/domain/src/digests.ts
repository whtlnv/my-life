export interface Digest<Proposal> {
  readonly key: string | undefined;
  readonly proposals: readonly Proposal[];
  readonly severityCounts: Readonly<Record<string, number>>;
}

type DigestableExtract =
  { readonly system: string } | { readonly company: string } | { readonly item: string; readonly change: string };

interface DigestableProposal {
  readonly accountEmail: string;
  readonly category: string;
  readonly from?: string;
  readonly extract: DigestableExtract | object;
}

const undigestedCategories = new Set(['expense', 'cc-thread']);

function isDigestable(proposal: DigestableProposal): boolean {
  return !undigestedCategories.has(proposal.category);
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

function senderAddress(from: string | undefined): string | undefined {
  return from?.match(/<([^>]+)>/)?.[1] ?? from;
}

export function digests<Proposal extends DigestableProposal>(proposals: readonly Proposal[]): Digest<Proposal>[] {
  const byAccountAndKey = new Map<string, { key: string | undefined; proposals: Proposal[] }>();
  for (const proposal of proposals.filter(isDigestable)) {
    const key = digestKey(proposal);
    const groupKey = JSON.stringify([proposal.accountEmail, key]);
    const group = byAccountAndKey.get(groupKey) ?? { key, proposals: [] };
    group.proposals.push(proposal);
    byAccountAndKey.set(groupKey, group);
  }
  return [...byAccountAndKey.values()].map((group) => ({ ...group, severityCounts: severityCounts(group.proposals) }));
}
