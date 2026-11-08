import { defineConfig } from 'wxt';

// The fixed key pins the extension ID across every Chrome profile and every unpacked reload, so one OAuth client
// (type "Chrome Extension") covers all of them. The matching private key lives outside the repo
// (~/Library/Application Support/my-life/extension-key.pem) and is only needed to pack a .crx, which we never do.
const key =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8Rk3tmf+gQVwzW1SPNMT4ufZvbpYBsZ0OeRtIkU0PiuR03rIVKCKAILyoKK8qwEvzAY0bdsot1vTl7mHBEd1WNamH2KJ7Vcw8T9mqoy3djcaH6R8m846aK2LCeKtL9WSQrDp0dwjMOkHfjVVCn9i5SvJMNQyCaDOYnUp48x1bQQIvmRDWDuVf6fiFRILKNgYObhn75F+lqzvpCoCNDkyeQK/WDbI6RdipqXz1sQbnClChBSKilHv4sEFzvAtkmWwgNZMtuIdAnIXBquJJo3I/dLcOOn07xGB4SqA86HPb4HGC20EMZIVVxqbjd0dhhnSPN3uXPx46krjuMekSyn0hwIDAQAB';

export default defineConfig({
  srcDir: 'src',
  // A function, not an object: WXT loads `.env` after this file is evaluated, so a top-level `process.env` read
  // would see an empty client id. WXT calls the function after the env files are loaded.
  manifest: () => ({
    name: 'my-life',
    description: "Reports this profile's calendars and mail to the local my-life backend.",
    key,
    permissions: ['identity', 'identity.email', 'alarms', 'storage'],
    action: { default_title: 'my-life' },
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*', 'https://www.googleapis.com/*'],
    oauth2: {
      client_id: process.env.WXT_GOOGLE_OAUTH_CLIENT_ID ?? '',
      scopes: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/contacts.readonly',
        'https://www.googleapis.com/auth/contacts.other.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.settings.basic',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    },
  }),
});
