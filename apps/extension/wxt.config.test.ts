import type { UserManifest } from 'wxt';
import { describe, expect, it } from 'vitest';

import config from './wxt.config';

describe('extension manifest', () => {
  it('requests the gmail.settings.basic scope so approved filters can be created', async () => {
    if (typeof config.manifest !== 'function') throw new Error('manifest must be a function');
    const manifest: UserManifest = await config.manifest({
      browser: 'chrome',
      manifestVersion: 3,
      mode: 'production',
      command: 'build',
    });

    expect(manifest.oauth2?.scopes).toContain('https://www.googleapis.com/auth/gmail.settings.basic');
  });
});
