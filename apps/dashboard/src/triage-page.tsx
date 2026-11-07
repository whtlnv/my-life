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
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

  useEffect(() => {
    void fetch('/triage-queue')
      .then((response) => response.json() as Promise<TriageQueueResponse>)
      .then(setQueue);
  }, []);

  if (queue === null) return null;

  return (
    <>
      <section aria-label="Action">
        {queue.action.map((item) => (
          <ActionCard key={item.messageId} item={item} />
        ))}
      </section>
      {queue.groups
        .filter((group) => group.category !== 'unknown')
        .map((group) => {
          const expanded = expandedCategories.includes(group.category);
          return (
            <section key={group.category}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => {
                  setExpandedCategories([...expandedCategories, group.category]);
                }}
              >
                {group.category} {group.count}
              </button>
              {expanded && group.items.map((item) => <p key={item.messageId}>{item.summary}</p>)}
            </section>
          );
        })}
    </>
  );
}
