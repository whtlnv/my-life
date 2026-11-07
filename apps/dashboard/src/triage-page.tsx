import { useEffect, useState } from 'react';

interface TriageItem {
  messageId: string;
  summary: string;
  reason: string;
  accountEmail: string;
  link: string;
  extract: { asker?: string; ask?: string; due?: string; significant?: boolean };
}

interface SystemGroup {
  system: string;
  items: TriageItem[];
}

interface TriageGroup {
  category: string;
  count: number;
  items: TriageItem[];
  systems?: SystemGroup[];
}

interface TriageQueueResponse {
  action: TriageItem[];
  groups: TriageGroup[];
}

export const noDueTimeText = 'No due time';
export const significantFlagText = 'Significant';

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

function CategoryGroup({ group }: { group: TriageGroup }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(true);
        }}
      >
        {group.category} {group.count}
      </button>
      {expanded &&
        (group.systems
          ? group.systems.map((systemGroup) => (
              <section key={systemGroup.system} aria-label={systemGroup.system}>
                {systemGroup.items.map((item) => (
                  <article key={item.messageId}>
                    <p>{item.summary}</p>
                    {item.extract.significant && <p>{significantFlagText}</p>}
                  </article>
                ))}
              </section>
            ))
          : group.items.map((item) => <p key={item.messageId}>{item.summary}</p>))}
    </section>
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

  return (
    <>
      <section aria-label="Action">
        {queue.action.map((item) => (
          <ActionCard key={item.messageId} item={item} />
        ))}
      </section>
      {queue.groups
        .filter((group) => group.category !== 'unknown')
        .map((group) => (
          <CategoryGroup key={group.category} group={group} />
        ))}
    </>
  );
}
