import { defineBackground } from 'wxt/utils/define-background';

import type { AccountEmailAnswer, AccountEmailMessage } from '../account-email-message';
import { answerBackendFetch, type BackendFetchMessage } from '../backend-fetch-relay';
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

const isBackendFetchMessage = (message: unknown): message is BackendFetchMessage =>
  typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'backend-fetch';

const isAccountEmailMessage = (message: unknown): message is AccountEmailMessage =>
  typeof message === 'object' && message !== null && (message as Partial<AccountEmailMessage>).type === 'account-email';

export default defineBackground(() => {
  chrome.action.onClicked.addListener(() => {
    void chrome.tabs.create({ url: backend });
  });
  // The WhatsApp content script's requests: the relay to the backend (WhatsApp routes only) and this profile's
  // account email. Returning true keeps the channel open for the asynchronous answer.
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isBackendFetchMessage(message)) {
      answerBackendFetch({ fetch: (input, init) => fetch(input, init), backendUrl: backend }, message).then(
        sendResponse,
        (error: unknown) => {
          sendResponse({ status: 502, body: { error: String(error) } });
        },
      );
      return true;
    }
    if (isAccountEmailMessage(message)) {
      profileAccountEmail().then(
        (email) => {
          sendResponse({ email } satisfies AccountEmailAnswer);
        },
        (error: unknown) => {
          sendResponse({ email: '', error: String(error) } satisfies AccountEmailAnswer);
        },
      );
      return true;
    }
    return false;
  });
  startExtension({
    fetch: (input, init) => fetch(input, init),
    profileAccountEmail,
    accessToken,
    backendUrl: backend,
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
