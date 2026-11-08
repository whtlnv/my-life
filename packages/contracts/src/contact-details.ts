import { z } from 'zod';

// What the dashboard sends on PATCH /contacts/:email: the free-label lists and the note the user keeps on a contact.
export const contactDetails = z.object({ lists: z.array(z.string()).optional(), note: z.string().optional() });
