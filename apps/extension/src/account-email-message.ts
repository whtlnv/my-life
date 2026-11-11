// The WhatsApp content script asks the background for this profile's account email with this message.
export interface AccountEmailMessage {
  type: 'account-email';
}

export interface AccountEmailAnswer {
  email: string;
  error?: string;
}
