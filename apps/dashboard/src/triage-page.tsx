import { useEffect, useState } from 'react';

interface TriageItem {
  messageId: string;
  summary: string;
  reason: string;
  accountEmail: string;
  link: string;
  extract: { asker?: string; ask?: string; due?: string };
}

interface TriageGroup {
  category: string;
  count: number;
  items: TriageItem[];
}

interface TriageQueueResponse {
  action: TriageItem[];
  groups: TriageGroup[];
}

export const noDueTimeText = 'No due time';

function ActionCard({ item }: { item: TriageItem }) {
  return (
    <article>
      <p>{item.summary}</p>
      <p>{item.extract.asker}</p>
      <p>{item.extract.ask}</p>
      <p>{item.extract.due ?? noDueTimeText}</p>
      <p>{item.reason}</p>
      <p>{item.accountEmail}</p>
      <a href={item.link}>Open in Gmail</a>
    </article>
  );
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
    <>
      <section aria-label="Action">
        {[...queue.action, ...unknownItems].map((item) => (
          <ActionCard key={item.messageId} item={item} />
        ))}
      </section>
      {queue.groups.map((group) => (
        <button key={group.category} type="button" aria-expanded={false}>
          {group.category} {group.count}
        </button>
      ))}
    </>
  );
}
