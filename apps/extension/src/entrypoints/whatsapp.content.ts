import { defineContentScript } from 'wxt/utils/define-content-script';

import { relayedFetch, type BackendFetchAnswer, type BackendFetchMessage } from '../backend-fetch-relay';
import { watchWhatsappPage } from '../whatsapp-report-watch';
import { carryOutWhatsappSends } from '../whatsapp-send';

// The shipped composition of the WhatsApp side (Phase 6b, locked decision 5): in the profile that keeps
// web.whatsapp.com open, report the chat list and the open chat on DOM mutation (10 s debounce) and carry out the
// send-whatsapp commands the dashboard queued. The page cannot reach the local backend itself, so every request goes
// through the background's backend-fetch relay; paths are relative to the backend, hence the empty backend URL.
const sendCommandsEveryMilliseconds = 5_000;

const sendToBackground = (message: BackendFetchMessage): Promise<BackendFetchAnswer> =>
  chrome.runtime.sendMessage(message);

const profileAccountEmail = async (): Promise<string> => {
  const { email } = await chrome.runtime.sendMessage<{ type: string }, { email: string }>({ type: 'account-email' });
  return email;
};

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  main() {
    const fetch = relayedFetch(sendToBackground);
    void profileAccountEmail()
      .then((accountEmail) => {
        watchWhatsappPage({ fetch, accountEmail, backendUrl: '', document });
        setInterval(() => {
          carryOutWhatsappSends({ fetch, accountEmail, backendUrl: '', document }).catch((error: unknown) => {
            console.error('my-life: carrying out WhatsApp sends failed', error);
          });
        }, sendCommandsEveryMilliseconds);
      })
      .catch((error: unknown) => {
        console.error('my-life: the WhatsApp content script could not start', error);
      });
  },
});
