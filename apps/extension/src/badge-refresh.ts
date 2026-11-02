import type { FetchFunction } from './fetch-function';

interface RefreshBadgeOptions {
  fetch: FetchFunction;
  backendUrl: string;
  setBadgeText: (text: string) => Promise<void>;
}

export async function refreshBadge(options: RefreshBadgeOptions): Promise<void> {
  const response = await options.fetch(`${options.backendUrl}/now`);
  const { badgeCount } = (await response.json()) as { badgeCount: number };
  await options.setBadgeText(badgeCount === 0 ? '' : String(badgeCount));
}
