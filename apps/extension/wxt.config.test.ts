import type { UserManifest } from 'wxt';
import { describe, expect, it } from 'vitest';

import config from './wxt.config';

async function buildManifest(): Promise<UserManifest> {
  if (typeof config.manifest !== 'function') throw new Error('manifest must be a function');
  return config.manifest({
    browser: 'chrome',
    manifestVersion: 3,
    mode: 'production',
    command: 'build',
  });
}

describe('extension manifest', () => {
  it('requests the gmail.settings.basic scope so approved filters can be created', async () => {
    const manifest = await buildManifest();

    expect(manifest.oauth2?.scopes).toContain('https://www.googleapis.com/auth/gmail.settings.basic');
  });

  it('requests the contacts.readonly and contacts.other.readonly scopes so Google Contacts can seed the People view', async () => {
    const manifest = await buildManifest();

    expect(manifest.oauth2?.scopes).toContain('https://www.googleapis.com/auth/contacts.readonly');
    expect(manifest.oauth2?.scopes).toContain('https://www.googleapis.com/auth/contacts.other.readonly');
  });
});
