import { isAddressedToUser } from './addressed-to-user';

export function displayedCategory(
  _proposal: { category: string },
  message: { to: string; cc: string },
  accountAddress: string,
): string {
  return isAddressedToUser(message, accountAddress) ? 'action' : 'cc-thread';
}
