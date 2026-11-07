import { defineBackground } from 'wxt/utils/define-background';

import { backendUrl } from '../backend-url';
import { startExtension } from '../extension-start';

// The shipped composition of startExtension: Chrome's identity for the profile's account and token, chrome.alarms
// for the 1-minute Gmail and 5-minute calendar polls, the action badge for the count, and a click on the icon opening the dashboard (CLAUDE.md
// locked decision 10). Manifest V3 re-runs this script on every wake, so each wake registers and polls once.
const backend = backendUrl(undefined);
const businessTimeZone = 'America/Mexico_City';

const profileAccountEmail = async (): Promise<string> => {
  const { email } = await chrome.identity.getProfileUserInfo({ accountStatus: chrome.identity.AccountStatus.ANY });
  if (email === '') throw new Error('this Chrome profile is not signed in to a Google account');
  return email;
};

const accessToken = async (): Promise<string> => {
  const { token } = await chrome.identity.getAuthToken({ interactive: true });
  if (token === undefined) throw new Error('Chrome returned no OAuth token');
  return token;
};

export default defineBackground(() => {
  chrome.action.onClicked.addListener(() => {
    void chrome.tabs.create({ url: backend });
  });
  startExtension({
    fetch: (input, init) => fetch(input, init),
    profileAccountEmail,
    accessToken,
    backendUrl: backend,
    now: new Date(),
    clock: () => new Date(),
    timeZone: businessTimeZone,
    // One alarm per schedule: the Gmail poll (every minute) and the calendar poll (every 5 minutes) each get their own
    // name, otherwise the second create() would overwrite the first alarm's period.
    every: (milliseconds, poll) => {
      const alarmName = `poll-every-${String(milliseconds)}ms`;
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === alarmName) void poll();
      });
      void chrome.alarms.create(alarmName, { periodInMinutes: milliseconds / 60_000 });
    },
    setBadgeText: (text) => chrome.action.setBadgeText({ text }),
  }).catch((error: unknown) => {
    console.error('my-life extension failed to start', error);
  });
});
