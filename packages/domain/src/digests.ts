export interface Digest<Proposal> {
  readonly proposals: readonly Proposal[];
}

export function digests<Proposal extends { readonly extract: { readonly system: string } }>(
  proposals: readonly Proposal[],
): Digest<Proposal>[] {
  const bySystem = new Map<string, Proposal[]>();
  for (const proposal of proposals) {
    const group = bySystem.get(proposal.extract.system) ?? [];
    group.push(proposal);
    bySystem.set(proposal.extract.system, group);
  }
  return [...bySystem.values()].map((group) => ({ proposals: group }));
}
