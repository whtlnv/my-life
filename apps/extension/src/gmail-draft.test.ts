import { describe, expect, it } from 'vitest';
import { rawDraftMessage } from './gmail-draft';

describe('rawDraftMessage', () => {
  it('encodes a non-English subject as a UTF-8 header word and the body as UTF-8 text, in base64url', () => {
    const raw = rawDraftMessage({ to: ['luis@example.com'], subject: 'Re: Reunión mañana', body: 'Sí, nos vemos — gracias.' });

    const message = Buffer.from(raw, 'base64url').toString('utf8');
    expect(raw).not.toMatch(/[+/=]/);
    expect(message).toContain(`Subject: =?UTF-8?B?${Buffer.from('Re: Reunión mañana', 'utf8').toString('base64')}?=`);
    expect(message).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(message.endsWith('\r\n\r\nSí, nos vemos — gracias.')).toBe(true);
  });
});
