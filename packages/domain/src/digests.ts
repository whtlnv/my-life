export interface Digest<Proposal> {
  readonly key: string | undefined;
  readonly proposals: readonly Proposal[];
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

function digestKey(proposal: DigestableProposal): string | undefined {
  return 'system' in proposal.extract ? proposal.extract.system : senderAddress(proposal.from);
}

function senderAddress(from: string | undefined): string | undefined {
  return from?.match(/<([^>]+)>/)?.[1] ?? from;
}

export function digests<Proposal extends DigestableProposal>(proposals: readonly Proposal[]): Digest<Proposal>[] {
  const byAccountAndKey = new Map<string, Digest<Proposal> & { proposals: Proposal[] }>();
  for (const proposal of proposals.filter((candidate) => !undigestedCategories.has(candidate.category))) {
    const key = digestKey(proposal);
    const groupKey = JSON.stringify([proposal.accountEmail, key]);
    const group = byAccountAndKey.get(groupKey) ?? { key, proposals: [] };
    group.proposals.push(proposal);
    byAccountAndKey.set(groupKey, group);
  }
  return [...byAccountAndKey.values()];
}
