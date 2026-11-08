export interface Digest<Proposal> {
  readonly proposals: readonly Proposal[];
}

export function digests<Proposal>(proposals: readonly Proposal[]): Digest<Proposal>[] {
  return [{ proposals }];
}
