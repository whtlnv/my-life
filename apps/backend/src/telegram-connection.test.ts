import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TelegramClient } from 'telegram';
import { describe, expect, it } from 'vitest';

import { createGramjsClient } from './telegram-connection';

describe('createGramjsClient', () => {
  it("builds gramjs's TelegramClient from the session file, the API id and the API hash, without connecting yet", () => {
    const directory = mkdtempSync(join(tmpdir(), 'my-life-'));
    try {
      const sessionPath = join(directory, 'telegram-session');
      writeFileSync(sessionPath, '');

      const client = createGramjsClient({ apiId: 12345678, apiHash: '0123456789abcdef0123456789abcdef', sessionPath });

      expect(client).toBeInstanceOf(TelegramClient);
      expect(client.apiId).toBe(12345678);
      expect(client.apiHash).toBe('0123456789abcdef0123456789abcdef');
      expect(client.connected).toBeFalsy();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
