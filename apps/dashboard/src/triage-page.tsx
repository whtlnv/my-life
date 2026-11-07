import { useEffect, useState } from 'react';

interface TriageItem {
  messageId: string;
  action: string;
  summary: string;
  reason: string;
  accountEmail: string;
  link: string;
  extract: {
    asker?: string;
    ask?: string;
    due?: string;
    significant?: boolean;
    vendor?: string;
    amount?: number;
    currency?: string;
    date?: string;
    company?: string;
    solution?: string;
    problem?: string;
  };
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

function postVerdict(verdict: object) {
  void fetch('/verdicts', { method: 'POST', body: JSON.stringify(verdict) });
}

function confirmVerdict(messageId: TriageItem['messageId']) {
  postVerdict({ messageId, decision: 'confirmed' });
}

function correctToAction(messageId: TriageItem['messageId'], action: 'keep' | 'archive') {
  postVerdict({ messageId, decision: 'rejected', correction: { action } });
}

function correctToTask(item: TriageItem) {
  postVerdict({
    messageId: item.messageId,
    decision: 'rejected',
    correction: { action: 'act', taskDraft: { title: item.summary } },
  });
}

function correctToCategory(messageId: TriageItem['messageId'], category: string, note: string) {
  postVerdict({ messageId, decision: 'rejected', correction: { category, note } });
}

const categories = ['action', 'cc-thread', 'expense', 'system-update', 'sales', 'calendar-drive', 'unknown'];

const verdictKeys = new Set(['t', 'k', 'a']);

function handleVerdictKey(item: TriageItem, key: string) {
  if (key === 't' && item.action === 'keep') {
    correctToTask(item);
  } else if (key === 'a' && item.action === 'act') {
    correctToAction(item.messageId, 'archive');
  } else if (key === 'k' && item.action === 'act') {
    correctToAction(item.messageId, 'keep');
  } else if (verdictKeys.has(key)) {
    confirmVerdict(item.messageId);
  }
}

function ActionCard({ item }: { item: TriageItem }) {
  const [correcting, setCorrecting] = useState(false);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  return (
    <article
      tabIndex={0}
      onKeyDown={(event) => {
        if (correcting) {
          if (event.key === 'Enter') {
            correctToCategory(item.messageId, category, note);
          } else if (event.key === 'Escape') {
            setCorrecting(false);
          } else if (event.target === event.currentTarget) {
            correctToAction(item.messageId, 'keep');
          }
        } else if (event.key === 'r') {
          setCorrecting(true);
        } else if (event.key === 'ArrowDown') {
          (event.currentTarget.nextElementSibling as HTMLElement).focus();
        } else if (event.key === 'ArrowUp') {
          (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
        } else {
          handleVerdictKey(item, event.key);
        }
      }}
    >
      {correcting && (
        <div role="dialog">
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
            }}
          >
            {categories.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <input
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </div>
      )}
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

function SystemSection({ systemGroup }: { systemGroup: SystemGroup }) {
  return (
    <section aria-label={systemGroup.system}>
      {systemGroup.items.map((item) => (
        <article key={item.messageId}>
          <p>{item.summary}</p>
          {item.extract.significant && <p>{significantFlagText}</p>}
        </article>
      ))}
    </section>
  );
}

function GroupItem({ item }: { item: TriageItem }) {
  return (
    <>
      <p>{item.summary}</p>
      <p>{item.extract.vendor}</p>
      <p>{item.extract.amount}</p>
      <p>{item.extract.currency}</p>
      <p>{item.extract.date}</p>
      <p>{item.extract.company}</p>
      <p>{item.extract.solution}</p>
      <p>{item.extract.problem}</p>
    </>
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
          ? group.systems.map((systemGroup) => <SystemSection key={systemGroup.system} systemGroup={systemGroup} />)
          : group.items.map((item) => <GroupItem key={item.messageId} item={item} />))}
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
