// The short name the dashboard shows for an account: the first label of its domain (`psmutuus`, `erlia`, `gmail`).
export function accountName(email: string): string {
  const domain = email.split('@')[1];
  if (domain === undefined) return email;
  return domain.split('.')[0] ?? domain;
}
