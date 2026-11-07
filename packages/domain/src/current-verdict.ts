export function currentVerdict<V>(verdicts: V[]): V | undefined {
  return verdicts.at(-1);
}
