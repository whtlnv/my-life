import { describe, expect, it } from 'vitest';

import { messageBody } from './message-body';

describe('messageBody', () => {
  it('comes out as the decoded text of a message with one text/plain part', () => {
    const payload = {
      mimeType: 'text/plain',
      headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
      body: { size: 46, data: 'SG9sYSBBbmEsCk5vcyB2ZW1vcyBlbCBtacOpcmNvbGVzIGEgbGFzIDEwOjAwPwo' },
    };

    expect(messageBody(payload)).toBe('Hola Ana,\nNos vemos el miércoles a las 10:00?\n');
  });
});
