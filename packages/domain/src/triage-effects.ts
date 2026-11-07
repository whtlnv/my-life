export const triageEffects: (
  proposal: { messageId: string; accountEmail: string; action: string },
  verdict: undefined,
) => { archives: never[] } = () => ({ archives: [] });
