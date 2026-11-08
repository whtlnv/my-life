export interface Digest<Proposal> {
  readonly proposals: readonly Proposal[];
}

export function digests<
  Proposal extends { readonly accountEmail: string; readonly extract: { readonly system: string } },
>(proposals: readonly Proposal[]): Digest<Proposal>[] {
  const byAccountAndSystem = new Map<string, Proposal[]>();
  for (const proposal of proposals) {
    const key = JSON.stringify([proposal.accountEmail, proposal.extract.system]);
    const group = byAccountAndSystem.get(key) ?? [];
    group.push(proposal);
    byAccountAndSystem.set(key, group);
  }
  return [...byAccountAndSystem.values()].map((group) => ({ proposals: group }));
}
