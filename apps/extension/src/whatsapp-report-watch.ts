import type { FetchFunction } from './fetch-function';
import { parseWhatsappPage } from './whatsapp-page-parser';
import { buildWhatsappReport } from './whatsapp-report';

const quietPeriodMilliseconds = 10_000;

const reportOrParserFailure = (document: Document) => {
  const page = parseWhatsappPage(document);
  return page.ok ? buildWhatsappReport(document) : { ...page, channel: 'whatsapp' };
};

export interface WhatsappPageWatchOptions {
  fetch: FetchFunction;
  accountEmail: string;
  backendUrl: string;
  document: Document;
}

export function watchWhatsappPage({ fetch, accountEmail, backendUrl, document }: WhatsappPageWatchOptions) {
  let pendingReport: ReturnType<typeof setTimeout> | undefined;
  const postReport = () =>
    fetch(`${backendUrl}/chat-messages`, {
      method: 'POST',
      body: JSON.stringify({ ...reportOrParserFailure(document), accountEmail }),
    });
  const observer = new MutationObserver(() => {
    clearTimeout(pendingReport);
    pendingReport = setTimeout(() => {
      void postReport();
    }, quietPeriodMilliseconds);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
