import { describe, expect, it } from 'vitest';

import { isAddressedToUser } from './addressed-to-user';

describe('isAddressedToUser', () => {
  it('is true when To lists the account address', () => {
    const message = {
      to: 'ana@example.com, franciscoc@psmutuus.com',
      cc: 'luis@example.com',
    };

    expect(isAddressedToUser(message, 'franciscoc@psmutuus.com')).toBe(true);
  });
});
