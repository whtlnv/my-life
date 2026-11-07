export interface AddressedMessage {
  to: string;
}

export const isAddressedToUser = (message: AddressedMessage, accountAddress: string): boolean =>
  message.to.toLowerCase().includes(accountAddress);
