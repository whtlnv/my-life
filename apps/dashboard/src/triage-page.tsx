import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

import { triageCategories } from '@my-life/contracts';

import { accountName } from './account-name';
import { categoryLabel, categorySwatches } from './category-labels';

type TriageCategory = (typeof triageCategories)[number];
type TriageAction = 'archive' | 'keep' | 'act';

interface TriageItem {
  messageId: string;
  action: TriageAction;
  category?: TriageCategory;
  summary: string;
  reason: string;
  accountEmail: string;
  link: string;
  extract: {
    asker?: string;
    ask?: string;
    due?: string;
    sinceLastMessage?: string;
    system?: string;
    severity?: string;
    significant?: boolean;
    vendor?: string;
    amount?: number;
    currency?: string;
    date?: string;
    company?: string;
    solution?: string;
    problem?: string;
    item?: string;
    change?: string;
  };
}

interface SystemGroup {
  system: string;
  items: TriageItem[];
}

interface TriageGroup {
  category: TriageCategory;
  count: number;
  items: TriageItem[];
  systems?: SystemGroup[];
}

interface Digest {
  id: string;
  severityCounts: Record<string, number>;
  summaryLines: string[];
  significantItems: { messageId: string; summary: string; accountEmail: string; link: string }[];
}

interface TriageQueueResponse {
  action: TriageItem[];
  groups: TriageGroup[];
  digests?: Digest[];
  remaining: number;
  paused?: boolean;
  fetchedAt?: string;
}

export const sectionTitles = {
  needsYou: 'Needs you',
  digests: 'Digests',
  needsInput: 'Needs input',
  handledForYou: 'Handled for you',
};
export const noDueTimeText = 'No due time';
export const nothingNeedsInputText = 'No questions waiting';
export const significantFlagText = 'Significant';
export const severityCountText = (severity: string, count: number) => `${String(count)} ${severity}`;
export const remainingMessagesText = (count: number) =>
  count === 1 ? '1 message remaining' : `${String(count)} messages remaining`;
export const pausedNoticeText = 'Triage is paused: the daily spend ceiling was reached';
export const fetchedAtText = (fetchedAt: string) =>
  `Fetched ${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date(fetchedAt))}`;

const queueRefreshIntervalMilliseconds = 30_000;

const actionLabels: Record<TriageAction, string> = { archive: 'archive', keep: 'keep', act: 'make a task' };

function formatAmount({ amount, currency }: TriageItem['extract']): string {
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount ?? 0,
  );
  return `${formatted} ${currency ?? ''}`.trim();
}

function postJson(path: string, body: object) {
  return fetch(path, { method: 'POST', body: JSON.stringify(body) });
}

function postVerdict(verdict: object) {
  return postJson('/verdicts', verdict);
}

function confirmVerdict(messageId: TriageItem['messageId']) {
  return postVerdict({ messageId, decision: 'confirmed' });
}

function confirmGroup(category: TriageGroup['category']) {
  return postJson('/group-verdicts', { category, decision: 'confirmed' });
}

function correctToAction(messageId: TriageItem['messageId'], action: 'keep' | 'archive') {
  return postVerdict({ messageId, decision: 'rejected', correction: { action } });
}

function correctToTask(item: TriageItem) {
  void postVerdict({
    messageId: item.messageId,
    decision: 'rejected',
    correction: { action: 'act', taskDraft: { title: item.summary } },
  });
}

function correctToCategory(messageId: TriageItem['messageId'], category: string, note: string) {
  return postVerdict({ messageId, decision: 'rejected', correction: { category, note } });
}

const verdictKeys = new Set(['t', 'k', 'a']);

function handleVerdictKey(item: TriageItem, key: string): Promise<Response> | undefined {
  if (key === 't' && item.action === 'keep') {
    correctToTask(item);
  } else if (key === 'a' && item.action === 'act') {
    return correctToAction(item.messageId, 'archive');
  } else if (key === 'k' && item.action === 'act') {
    void correctToAction(item.messageId, 'keep');
  } else if (verdictKeys.has(key)) {
    return confirmVerdict(item.messageId);
  }
  return undefined;
}

function whenAccepted(request: Promise<Response> | undefined, onAccepted: () => void) {
  void request?.then((response) => {
    if (response.ok) onAccepted();
  });
}

function Key({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

function CorrectionPanel({
  category,
  note,
  onCategory,
  onNote,
}: {
  category: string;
  note: string;
  onCategory: (category: string) => void;
  onNote: (note: string) => void;
}) {
  return (
    <div role="dialog" aria-label="Recategorize" className="correction">
      <label htmlFor="correction-category">Category</label>
      <select
        id="correction-category"
        value={category}
        onChange={(event) => {
          onCategory(event.target.value);
        }}
      >
        {triageCategories.map((option) => (
          <option key={option} value={option}>
            {categoryLabel(option)}
          </option>
        ))}
      </select>
      <input
        aria-label="Note"
        placeholder="Why (optional)"
        value={note}
        onChange={(event) => {
          onNote(event.target.value);
        }}
      />
      <span className="hint">
        <Key>Enter</Key> sends the correction · <Key>Esc</Key> cancels
      </span>
    </div>
  );
}

function ActionCard({ item, autoFocus, onAccepted }: { item: TriageItem; autoFocus: boolean; onAccepted: () => void }) {
  const [correcting, setCorrecting] = useState(false);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (autoFocus) cardRef.current?.focus();
  }, [autoFocus]);

  const act = (key: string) => {
    whenAccepted(handleVerdictKey(item, key), onAccepted);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (correcting) {
      if (event.key === 'Enter') {
        whenAccepted(correctToCategory(item.messageId, category, note), onAccepted);
      } else if (event.key === 'Escape') {
        setCorrecting(false);
      } else if (event.target === event.currentTarget) {
        void correctToAction(item.messageId, 'keep');
      }
    } else if (event.key === 'r') {
      setCorrecting(true);
    } else if (event.key === 'ArrowDown') {
      (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
    } else if (event.key === 'ArrowUp') {
      (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
    } else {
      act(event.key);
    }
  };

  const unknown = item.category === 'unknown';
  const ask = item.extract.ask;
  return (
    <article ref={cardRef} className="card card-hero" tabIndex={0} onKeyDown={onKeyDown}>
      {correcting && <CorrectionPanel category={category} note={note} onCategory={setCategory} onNote={setNote} />}
      <div className="card-head">
        <span className="card-who">{item.extract.asker ?? 'Unfamiliar sender'}</span>
        <span className={item.extract.due ? 'pill pill-warning' : 'pill pill-muted'}>
          {item.extract.due ?? noDueTimeText}
        </span>
        <span className="pill" title={item.accountEmail}>
          {item.accountEmail}
        </span>
        {unknown && <span className="pill pill-muted">Unknown</span>}
      </div>
      <p className="card-ask">{ask ?? item.summary}</p>
      {ask && <p className="card-summary">{item.summary}</p>}
      <p className="card-reason">{item.reason}</p>
      <div className="card-foot">
        <span className="pill pill-accent">Proposes: {actionLabels[item.action]}</span>
        <a href={item.link} target="_blank" rel="noreferrer">
          Open in Gmail ↗
        </a>
        <span className="spacer" />
        <button
          type="button"
          className="button"
          onClick={() => {
            act('t');
          }}
        >
          Task <Key>t</Key>
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            act('k');
          }}
        >
          Keep <Key>k</Key>
        </button>
        <button
          type="button"
          className="button button-danger"
          onClick={() => {
            act('a');
          }}
        >
          Archive <Key>a</Key>
        </button>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            setCorrecting(true);
          }}
        >
          Recategorize <Key>r</Key>
        </button>
      </div>
    </article>
  );
}

function Row({ title, detail, side }: { title: ReactNode; detail?: ReactNode; side?: ReactNode }) {
  return (
    <div className="row">
      <div className="row-main">
        <p className="row-title">{title}</p>
        {detail && <p className="row-detail">{detail}</p>}
      </div>
      {side && <div className="row-side">{side}</div>}
    </div>
  );
}

function SystemSection({ systemGroup }: { systemGroup: SystemGroup }) {
  return (
    <section aria-label={systemGroup.system} className="system">
      <h3 className="system-title">{systemGroup.system}</h3>
      {systemGroup.items.map((item) => (
        <article key={item.messageId} className="row">
          <div className="row-main">
            <p className="row-title">
              {item.extract.significant && <span className="pill pill-danger">{significantFlagText}</span>}{' '}
              {item.summary}
            </p>
          </div>
          <div className="row-side">
            <span>{accountName(item.accountEmail)}</span>
          </div>
        </article>
      ))}
    </section>
  );
}

function ExpenseTable({ items }: { items: TriageItem[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Vendor</th>
          <th className="amount">Amount</th>
          <th>Date</th>
          <th>Summary</th>
          <th>Account</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.messageId}>
            <td>{item.extract.vendor}</td>
            <td className="amount">{formatAmount(item.extract)}</td>
            <td className="muted">{item.extract.date}</td>
            <td>{item.summary}</td>
            <td className="muted">{accountName(item.accountEmail)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GroupRows({ group }: { group: TriageGroup }) {
  const side = (item: TriageItem) => <span>{accountName(item.accountEmail)}</span>;
  switch (group.category) {
    case 'expense':
      return <ExpenseTable items={group.items} />;
    case 'sales':
      return (
        <div className="rows">
          {group.items.map((item) => (
            <Row
              key={item.messageId}
              title={`${item.extract.company ?? ''} — ${item.extract.solution ?? ''}`}
              detail={item.extract.problem}
              side={side(item)}
            />
          ))}
        </div>
      );
    case 'calendar-drive':
      return (
        <div className="rows">
          {group.items.map((item) => (
            <Row
              key={item.messageId}
              title={item.extract.item ?? item.summary}
              detail={item.extract.change}
              side={side(item)}
            />
          ))}
        </div>
      );
    default:
      return (
        <div className="rows">
          {group.items.map((item) => (
            <Row key={item.messageId} title={item.summary} detail={item.extract.sinceLastMessage} side={side(item)} />
          ))}
        </div>
      );
  }
}

function proposalSummary(group: TriageGroup): string {
  const counts = new Map<TriageAction, number>();
  for (const item of group.items) counts.set(item.action, (counts.get(item.action) ?? 0) + 1);
  const parts = [...counts.entries()].map(([action, count]) => `${String(count)} ${actionLabels[action]}`);
  return parts.length === 1 ? parts.join('').replace(/^\d+ /, 'all ') : parts.join(' · ');
}

function CategoryGroup({ group, onAccepted }: { group: TriageGroup; onAccepted: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const confirmAll = () => {
    whenAccepted(confirmGroup(group.category), onAccepted);
  };
  const style = { '--swatch': categorySwatches[group.category] } as CSSProperties;
  return (
    <section className="group" style={style}>
      <div className="group-row">
        <button
          type="button"
          className="group-toggle"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((current) => !current);
          }}
          onKeyDown={(event) => {
            if (event.key === 'c') confirmAll();
          }}
        >
          <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
            <path d="M6 3.5 10.5 8 6 12.5z" />
          </svg>
          <span className="group-swatch" aria-hidden="true" />
          <span className="group-label">{categoryLabel(group.category)}</span>
          <span className="count">{group.count}</span>
          <span className="group-proposal">{proposalSummary(group)}</span>
        </button>
        <button type="button" className="button" onClick={confirmAll}>
          Confirm all <Key>c</Key>
        </button>
      </div>
      {expanded && (
        <div className="group-body">
          {group.systems ? (
            group.systems.map((systemGroup) => <SystemSection key={systemGroup.system} systemGroup={systemGroup} />)
          ) : (
            <GroupRows group={group} />
          )}
        </div>
      )}
    </section>
  );
}

function DigestCard({ digest }: { digest: Digest }) {
  return (
    <article className="card">
      {digest.summaryLines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {Object.entries(digest.severityCounts).map(([severity, count]) => (
        <span key={severity} className="pill">
          {severityCountText(severity, count)}
        </span>
      ))}
      <ul>
        {digest.significantItems.map((item) => (
          <li key={item.messageId}>
            <a href={item.link}>{item.summary}</a>
            <span>{accountName(item.accountEmail)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Legend() {
  return (
    <p className="legend" aria-label="Keys">
      <span>
        <Key>t</Key> task
      </span>
      <span>
        <Key>k</Key> keep
      </span>
      <span>
        <Key>a</Key> archive
      </span>
      <span>
        <Key>r</Key> recategorize
      </span>
      <span>
        <Key>c</Key> confirm a whole group
      </span>
      <span>
        <Key>↑</Key>
        <Key>↓</Key> move
      </span>
    </p>
  );
}

export function TriagePage() {
  const [queue, setQueue] = useState<TriageQueueResponse | null>(null);

  useEffect(() => {
    const loadQueue = () =>
      void fetch('/triage-queue')
        .then((response) => response.json() as Promise<TriageQueueResponse>)
        .then(setQueue)
        .catch(() => undefined);
    loadQueue();
    const interval = setInterval(loadQueue, queueRefreshIntervalMilliseconds);
    return () => {
      clearInterval(interval);
    };
  }, []);

  if (queue === null) return null;

  function removeActionItem(messageId: TriageItem['messageId']) {
    setQueue(
      (current) => current && { ...current, action: current.action.filter((other) => other.messageId !== messageId) },
    );
  }

  function removeGroup(category: TriageGroup['category']) {
    setQueue(
      (current) => current && { ...current, groups: current.groups.filter((other) => other.category !== category) },
    );
  }

  const groups = queue.groups.filter((group) => group.category !== 'unknown');
  return (
    <main>
      <header className="page-header">
        <h1 className="page-title">Triage</h1>
        <p className="page-meta">
          <span>{remainingMessagesText(queue.remaining)}</span>
          {queue.fetchedAt !== undefined && (
            <>
              <span aria-hidden="true">·</span>
              <span title={queue.fetchedAt}>{fetchedAtText(queue.fetchedAt)}</span>
            </>
          )}
        </p>
      </header>
      {queue.paused && (
        <p className="banner" role="status">
          {pausedNoticeText}
        </p>
      )}
      <Legend />
      <section aria-label={sectionTitles.needsYou}>
        <h2 className="section-title">
          {sectionTitles.needsYou} <span className="count">{queue.action.length}</span>
        </h2>
        {queue.action.length === 0 && (
          <p className="empty">
            <strong>Nothing needs you</strong>
            Mail addressed to you with an ask lands here first.
          </p>
        )}
        {queue.action.map((item, index) => (
          <ActionCard
            key={item.messageId}
            item={item}
            autoFocus={index === 0}
            onAccepted={() => {
              removeActionItem(item.messageId);
            }}
          />
        ))}
      </section>
      <section aria-label={sectionTitles.digests} className="section">
        <h2 className="section-title">{sectionTitles.digests}</h2>
        {queue.digests?.map((digest) => (
          <DigestCard key={digest.id} digest={digest} />
        ))}
      </section>
      <section aria-label={sectionTitles.needsInput} className="section">
        <h2 className="section-title">{sectionTitles.needsInput}</h2>
        <p className="empty">{nothingNeedsInputText}</p>
      </section>
      <section aria-label={sectionTitles.handledForYou} className="section">
        <h2 className="section-title">{sectionTitles.handledForYou}</h2>
      </section>
      <section className="section">
        <h2 className="section-title">Everything else</h2>
        {groups.length === 0 && <p className="empty">No groups waiting</p>}
        {groups.map((group) => (
          <CategoryGroup
            key={group.category}
            group={group}
            onAccepted={() => {
              removeGroup(group.category);
            }}
          />
        ))}
      </section>
    </main>
  );
}
