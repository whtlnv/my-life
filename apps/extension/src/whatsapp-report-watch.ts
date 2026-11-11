import type { FetchFunction } from './fetch-function';
import { parseWhatsappPage } from './whatsapp-page-parser';
import { buildWhatsappReport } from './whatsapp-report';

const quietPeriodMilliseconds = 10_000;

export interface WhatsappPageWatchOptions {
  fetch: FetchFunction;
  accountEmail: string;
  backendUrl: string;
  document: Document;
}

export function watchWhatsappPage({ fetch, accountEmail, backendUrl, document }: WhatsappPageWatchOptions) {
  let pendingReport: ReturnType<typeof setTimeout> | undefined;
  const postReport = () => {
    const page = parseWhatsappPage(document);
    const report = page.ok ? buildWhatsappReport(document) : { ...page, channel: 'whatsapp' };
    return fetch(`${backendUrl}/chat-messages`, {
      method: 'POST',
      body: JSON.stringify({ ...report, accountEmail }),
    });
  };
  const observer = new MutationObserver(() => {
    clearTimeout(pendingReport);
    pendingReport = setTimeout(postReport, quietPeriodMilliseconds);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
