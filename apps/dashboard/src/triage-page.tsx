import { useEffect, useState } from 'react';

interface ActionItem {
  messageId: string;
  extract: { asker: string; ask: string; due?: string };
}

interface TriageQueueResponse {
  action: ActionItem[];
}

export function TriagePage() {
  const [queue, setQueue] = useState<TriageQueueResponse | null>(null);

  useEffect(() => {
    void fetch('/triage-queue')
      .then((response) => response.json() as Promise<TriageQueueResponse>)
      .then(setQueue);
  }, []);

  if (queue === null) return null;

  return (
    <section aria-label="Action">
      {queue.action.map((item) => (
        <article key={item.messageId}>
          <p>{item.extract.asker}</p>
          <p>{item.extract.ask}</p>
          <p>{item.extract.due}</p>
        </article>
      ))}
    </section>
  );
}
