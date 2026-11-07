import { useEffect, useState } from 'react';

interface TriageItem {
  messageId: string;
  summary: string;
  extract: { asker?: string; ask?: string; due?: string };
}

interface TriageGroup {
  category: string;
  items: TriageItem[];
}

interface TriageQueueResponse {
  action: TriageItem[];
  groups: TriageGroup[];
}

export function TriagePage() {
  const [queue, setQueue] = useState<TriageQueueResponse | null>(null);

  useEffect(() => {
    void fetch('/triage-queue')
      .then((response) => response.json() as Promise<TriageQueueResponse>)
      .then(setQueue);
  }, []);

  if (queue === null) return null;

  const unknownItems = queue.groups.find((group) => group.category === 'unknown')?.items ?? [];

  return (
    <section aria-label="Action">
      {[...queue.action, ...unknownItems].map((item) => (
        <article key={item.messageId}>
          <p>{item.summary}</p>
          <p>{item.extract.asker}</p>
          <p>{item.extract.ask}</p>
          <p>{item.extract.due}</p>
        </article>
      ))}
    </section>
  );
}
