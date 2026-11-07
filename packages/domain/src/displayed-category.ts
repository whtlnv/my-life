import { isAddressedToUser } from './addressed-to-user';

export function displayedCategory(
  proposal: { category: string },
  message: { to: string; cc: string },
  accountAddress: string,
): string {
  if (proposal.category !== 'action') return proposal.category;
  return isAddressedToUser(message, accountAddress) ? 'action' : 'cc-thread';
}
