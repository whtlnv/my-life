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

  it('comes out as the text of a message with only an HTML part, with every tag removed', () => {
    const payload = {
      mimeType: 'text/html',
      headers: [{ name: 'Content-Type', value: 'text/html; charset="UTF-8"' }],
      body: {
        size: 72,
        data: 'PGh0bWw-PGJvZHk-PHA-SG9sYSA8Yj5BbmE8L2I-LCBub3MgdmVtb3MgYSBsYXMgMTA6MDA_PC9wPjwvYm9keT48L2h0bWw-',
      },
    };

    expect(messageBody(payload)).toBe('Hola Ana, nos vemos a las 10:00?');
  });
});
