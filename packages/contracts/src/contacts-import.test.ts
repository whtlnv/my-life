import { describe, expect, it } from 'vitest';

import { contactsImport } from './contacts-import';

describe('contactsImport', () => {
  it('accepts a starred contact with an organization and lists, and an Other Contact with only a name and emails', () => {
    const report = {
      accountEmail: 'francisco@example.com',
      contacts: [
        { name: 'Ana Ruiz', emails: ['ana@acme.com'], organization: 'Acme', starred: true, lists: ['Clients'] },
        { name: 'Marta Gil', emails: ['marta@gil.mx'] },
      ],
    };

    expect(contactsImport.parse(report)).toEqual(report);
  });

  it('accepts an Other Contact that Google knows only by its email, without a name', () => {
    const report = {
      accountEmail: 'francisco@example.com',
      contacts: [{ emails: ['noreply@vendor.io'], starred: false, lists: [] }],
    };

    expect(contactsImport.safeParse(report).success).toBe(true);
  });
});
