import { z } from 'zod';

const importedContact = z.object({
  name: z.string(),
  emails: z.array(z.string()),
  organization: z.string().optional(),
  starred: z.boolean().optional(),
  lists: z.array(z.string()).optional(),
});

// What the extension posts to the backend after reading one account's Google Contacts.
export const contactsImport = z.object({ accountEmail: z.string(), contacts: z.array(importedContact) });
