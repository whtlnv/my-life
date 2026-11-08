import { describe, expect, it } from 'vitest';

import { contactDetails } from './contact-details';

describe('contactDetails', () => {
  it('accepts lists of text and a text note, and rejects a note that is not text', () => {
    expect({
      listsAndNote: contactDetails.safeParse({ lists: ['Clients'], note: 'Prefers WhatsApp' }).success,
      numericNote: contactDetails.safeParse({ note: 42 }).success,
    }).toEqual({ listsAndNote: true, numericNote: false });
  });
});
