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

  it('comes out from the text/plain part of a multipart/alternative message, not its HTML part', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      headers: [{ name: 'Content-Type', value: 'multipart/alternative; boundary="000000000000abc123"' }],
      body: { size: 0 },
      parts: [
        {
          partId: '0',
          mimeType: 'text/plain',
          headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
          body: { size: 33, data: 'SG9sYSBBbmEsCk5vcyB2ZW1vcyBhIGxhcyAxMDowMD8K' },
        },
        {
          partId: '1',
          mimeType: 'text/html',
          headers: [{ name: 'Content-Type', value: 'text/html; charset="UTF-8"' }],
          body: {
            size: 72,
            data: 'PGh0bWw-PGJvZHk-PHA-SG9sYSA8Yj5BbmE8L2I-LCBub3MgdmVtb3MgYSBsYXMgMTA6MDA_PC9wPjwvYm9keT48L2h0bWw-',
          },
        },
      ],
    };

    expect(messageBody(payload)).toBe('Hola Ana,\nNos vemos a las 10:00?\n');
  });

  it('drops the lines of a quoted reply, from its "On … wrote:" line to the ">" lines after it', () => {
    const payload = {
      mimeType: 'text/plain',
      headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
      body: {
        size: 139,
        data: 'UGVyZmVjdG8sIGFow60gZXN0YXLDqS4KCk9uIFdlZCwgTm92IDQsIDIwMjYgYXQgOToxMiBBTSBBbmEgTMOzcGV6IDxhbmFAZXhhbXBsZS5jb20-IHdyb3RlOgo-IEhvbGEsCj4gTm9zIHZlbW9zIGVsIG1pw6lyY29sZXMgYSBsYXMgMTA6MDA_Cg',
      },
    };

    expect(messageBody(payload)).toBe('Perfecto, ahí estaré.\n');
  });

  it('keeps every line of a body without a quoted reply, including a wrapped line with "wrote:" mid-sentence', () => {
    const payload = {
      mimeType: 'text/plain',
      headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
      body: {
        size: 81,
        data: 'SG9sYSBlcXVpcG8sCgpPbiBGcmlkYXksIGp1c3QgYXMgQW5hIHdyb3RlOgp0aGUgdmVudWUgbW92ZWQgdG8gdGhlIHNlY29uZCBmbG9vci4K',
      },
    };

    expect(messageBody(payload)).toBe(
      'Hola equipo,\n\nOn Friday, just as Ana wrote:\nthe venue moved to the second floor.\n',
    );
  });

  it('drops a signature after a "-- " delimiter line', () => {
    const payload = {
      mimeType: 'text/plain',
      headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
      body: {
        size: 65,
        data: 'R3JhY2lhcywgbG8gcmV2aXNvIGhveS4KCi0tIApBbmEgTMOzcGV6CkRpcmVjdG9yYSBkZSBPcGVyYWNpb25lcwo',
      },
    };

    expect(messageBody(payload)).toBe('Gracias, lo reviso hoy.\n');
  });

  it('cuts a body over 20 KB to its first 20 KB', () => {
    const text = 'a'.repeat(30_000);
    const payload = {
      mimeType: 'text/plain',
      headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
      body: { size: 30_000, data: Buffer.from(text, 'utf8').toString('base64url') },
    };

    expect(messageBody(payload)).toBe(text.slice(0, 20 * 1024));
  });

  it('never takes text from an attachment part, even a text/plain one', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      filename: '',
      headers: [{ name: 'Content-Type', value: 'multipart/mixed; boundary="000000000000def456"' }],
      body: { size: 0 },
      parts: [
        {
          partId: '0',
          mimeType: 'multipart/alternative',
          filename: '',
          headers: [{ name: 'Content-Type', value: 'multipart/alternative; boundary="000000000000abc123"' }],
          body: { size: 0 },
          parts: [
            {
              partId: '0.0',
              mimeType: 'text/plain',
              filename: '',
              headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
              body: { size: 39, data: 'SG9sYSBBbmEsClRlIG1hbmRvIGxhcyBub3RhcyBhZGp1bnRhcy4K' },
            },
            {
              partId: '0.1',
              mimeType: 'text/html',
              filename: '',
              headers: [{ name: 'Content-Type', value: 'text/html; charset="UTF-8"' }],
              body: { size: 45, data: 'PHA-SG9sYSBBbmEsIHRlIG1hbmRvIGxhcyBub3RhcyBhZGp1bnRhcy48L3A-' },
            },
          ],
        },
        {
          partId: '1',
          mimeType: 'text/plain',
          filename: 'notas.txt',
          headers: [
            { name: 'Content-Type', value: 'text/plain; charset="UTF-8"; name="notas.txt"' },
            { name: 'Content-Disposition', value: 'attachment; filename="notas.txt"' },
          ],
          body: { size: 30, data: 'Tm90YXMgaW50ZXJuYXM6IG5vIGNvbXBhcnRpci4K' },
        },
      ],
    };

    expect(messageBody(payload)).toBe('Hola Ana,\nTe mando las notas adjuntas.\n');
  });

  it('comes out as the text of the HTML part of a multipart/mixed message whose only text part is HTML', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      filename: '',
      headers: [{ name: 'Content-Type', value: 'multipart/mixed; boundary="000000000000fed789"' }],
      body: { size: 0 },
      parts: [
        {
          partId: '0',
          mimeType: 'text/html',
          filename: '',
          headers: [{ name: 'Content-Type', value: 'text/html; charset="UTF-8"' }],
          body: { size: 37, data: 'PHA-SG9sYSBBbmEsIHRlIG1hbmRvIGxhIGZhY3R1cmEuPC9wPg' },
        },
        {
          partId: '1',
          mimeType: 'application/pdf',
          filename: 'factura.pdf',
          headers: [
            { name: 'Content-Type', value: 'application/pdf; name="factura.pdf"' },
            { name: 'Content-Disposition', value: 'attachment; filename="factura.pdf"' },
          ],
          body: { size: 48213, attachmentId: 'ANGjdJ8factura' },
        },
      ],
    };

    expect(messageBody(payload)).toBe('Hola Ana, te mando la factura.');
  });

  it('drops the contents of the style and script elements of an HTML body and decodes its entities', () => {
    const html =
      '<html><head><style>p { color: red; }</style><script>track("open");</script></head>' +
      '<body><p>Ana &amp; Luis:&nbsp;el total es &lt;$500 &gt; &quot;OK&quot; &#39;ya&#39;</p></body></html>';
    const payload = {
      mimeType: 'text/html',
      headers: [{ name: 'Content-Type', value: 'text/html; charset="UTF-8"' }],
      body: { size: html.length, data: Buffer.from(html, 'utf8').toString('base64url') },
    };

    expect(messageBody(payload)).toBe('Ana & Luis: el total es <$500 > "OK" \'ya\'');
  });
});
