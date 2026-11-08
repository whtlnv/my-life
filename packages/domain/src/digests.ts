export interface Digest<Proposal> {
  readonly key: string | undefined;
  readonly proposals: readonly Proposal[];
}

export function digests<
  Proposal extends {
    readonly accountEmail: string;
    readonly from?: string;
    readonly extract: { readonly system: string } | { readonly company: string };
  },
>(proposals: readonly Proposal[]): Digest<Proposal>[] {
  const byAccountAndKey = new Map<string, Digest<Proposal> & { proposals: Proposal[] }>();
  for (const proposal of proposals) {
    const key = 'system' in proposal.extract ? proposal.extract.system : proposal.from;
    const groupKey = JSON.stringify([proposal.accountEmail, key]);
    const group = byAccountAndKey.get(groupKey) ?? { key, proposals: [] };
    group.proposals.push(proposal);
    byAccountAndKey.set(groupKey, group);
  }
  return [...byAccountAndKey.values()];
}
