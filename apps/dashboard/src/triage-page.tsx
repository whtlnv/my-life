import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

import { triageCategories } from '@my-life/contracts';

import { businessTimeZone, timeInBusinessZone } from './app-shell';
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
  accountEmail: string;
  category: string;
  key?: string;
  count: number;
  severityCounts: Record<string, number>;
  summaryLines: string[];
  significantItems: { messageId: string; summary: string; accountEmail: string; link: string }[];
}

interface SlackTriageItem {
  workspaceTeamId: string;
  workspaceName?: string;
  conversationId: string;
  senderName: string;
  text: string;
  timestamp: string;
  permalink: string;
}

interface ChatTriageItem {
  channel: 'telegram';
  chatId: string;
  messageId: string;
  chatTitle: string;
  senderName: string;
  text: string;
  time: string;
  link: string;
}

interface TriageQueueResponse {
  action: TriageItem[];
  chatItems?: ChatTriageItem[];
  slackItems?: SlackTriageItem[];
  groups: TriageGroup[];
  digests?: Digest[];
  handledForYou?: TriageItem[];
  remaining: number;
  paused?: boolean;
  fetchedAt?: string;
}

export const sectionTitles = {
  needsYou: 'Needs you',
  digests: 'Digests',
  needsInput: 'Needs input',
  handledForYou: 'Handled for you',
  slack: 'Slack',
};
export const channelLabels = { telegram: 'Telegram' };
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
    timeZone: businessTimeZone,
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

function whenSent(request: Promise<Response>, onSent: () => void, onError: (error: string) => void) {
  void request.then((response) => {
    if (response.ok) onSent();
    else
      void response.json().then(
        ({ error }: { error: string }) => {
          onError(error);
        },
        () => undefined,
      );
  });
}

function Key({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M6 3.5 10.5 8 6 12.5z" />
    </svg>
  );
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

function Row({
  title,
  detail,
  side,
  as: Element = 'div',
}: {
  title: ReactNode;
  detail?: ReactNode;
  side?: ReactNode;
  as?: 'div' | 'li';
}) {
  return (
    <Element className="row">
      <div className="row-main">
        <p className="row-title">{title}</p>
        {detail && <p className="row-detail">{detail}</p>}
      </div>
      {side && <div className="row-side">{side}</div>}
    </Element>
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
          <Chevron />
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

function confirmDigest(id: Digest['id']) {
  return fetch(`/digests/${encodeURIComponent(id)}/confirmation`, { method: 'POST' });
}

const severityPillClasses: Record<string, string> = {
  critical: 'pill pill-danger',
  error: 'pill pill-danger',
  high: 'pill pill-danger',
  warning: 'pill pill-warning',
  medium: 'pill pill-warning',
};

function DigestCard({ digest, onAccepted }: { digest: Digest; onAccepted: () => void }) {
  const [headline, ...rest] = digest.summaryLines;
  const style = { '--swatch': categorySwatches[digest.category] } as CSSProperties;
  return (
    <article className="card digest" style={style}>
      <div className="card-head">
        <span className="group-swatch" aria-hidden="true" />
        <span className="card-who">{digest.key ?? categoryLabel(digest.category)}</span>
        <span className="count">{digest.count}</span>
        <span className="pill pill-muted">{categoryLabel(digest.category)}</span>
        <span className="pill" title={digest.accountEmail}>
          {accountName(digest.accountEmail)}
        </span>
      </div>
      {headline && <p className="card-ask">{headline}</p>}
      {rest.map((line) => (
        <p key={line} className="card-summary">
          {line}
        </p>
      ))}
      {digest.significantItems.length > 0 && (
        <ul className="rows">
          {digest.significantItems.map((item) => (
            <Row
              as="li"
              key={item.messageId}
              title={
                <>
                  <span className="pill pill-danger">{significantFlagText}</span>{' '}
                  <a href={item.link} target="_blank" rel="noreferrer">
                    {item.summary}
                  </a>
                </>
              }
              side={<span className="muted">{accountName(item.accountEmail)}</span>}
            />
          ))}
        </ul>
      )}
      <div className="card-foot">
        {Object.entries(digest.severityCounts).map(([severity, count]) => (
          <span key={severity} className={severityPillClasses[severity] ?? 'pill pill-muted'}>
            {severityCountText(severity, count)}
          </span>
        ))}
        <span className="spacer" />
        <button
          type="button"
          className="button"
          onClick={() => {
            whenAccepted(confirmDigest(digest.id), onAccepted);
          }}
        >
          Confirm
        </button>
      </div>
    </article>
  );
}

function undoHandledItem(messageId: TriageItem['messageId']) {
  return fetch(`/handled-for-you/${encodeURIComponent(messageId)}/undo`, { method: 'POST' });
}

function HandledForYouSection({
  items,
  onUndone,
}: {
  items: TriageItem[] | undefined;
  onUndone: (messageId: TriageItem['messageId']) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section aria-label={sectionTitles.handledForYou} className="section">
      <div className="group handled">
        <div className="group-row">
          <button
            type="button"
            className="group-toggle"
            aria-expanded={expanded}
            onClick={() => {
              setExpanded((current) => !current);
            }}
          >
            <Chevron />
            <span className="group-label">{sectionTitles.handledForYou}</span>
            <span className="count">{items?.length}</span>
            <span className="group-proposal">done by automatic categories today, labeled my-life/auto</span>
          </button>
        </div>
        {expanded && (
          <div className="group-body">
            <ul className="rows">
              {items?.map((item) => (
                <Row
                  as="li"
                  key={item.messageId}
                  title={item.summary}
                  detail={
                    <>
                      <span>{categoryLabel(item.category ?? '')}</span> · <span>{accountName(item.accountEmail)}</span>
                    </>
                  }
                  side={
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => {
                        whenAccepted(undoHandledItem(item.messageId), () => {
                          onUndone(item.messageId);
                        });
                      }}
                    >
                      Undo
                    </button>
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

const slackDecisionKeys: Record<string, string> = { i: 'ignore', t: 'act' };

function postSlackVerdict(item: SlackTriageItem, key: string) {
  const decision = slackDecisionKeys[key];
  if (decision === undefined) return;
  const { workspaceTeamId, conversationId, timestamp } = item;
  return postJson('/slack-verdicts', { workspaceTeamId, conversationId, timestamp, decision });
}

function postSlackSend(item: SlackTriageItem, text: string) {
  const { workspaceTeamId, conversationId, timestamp } = item;
  return postJson('/slack-sends', { workspaceTeamId, conversationId, threadTimestamp: timestamp, text });
}

// A Slack timestamp is seconds since the epoch, with a sequence after the dot.
function slackMessageTime(timestamp: string): string {
  return timeInBusinessZone(new Date(Number(timestamp.split('.')[0]) * 1000).toISOString());
}

const sendPromise = 'Sent as you, only when you press Send';

function SlackCard({ item, onAccepted }: { item: SlackTriageItem; onAccepted: () => void }) {
  const [composing, setComposing] = useState(false);
  const [reply, setReply] = useState('');
  const [sendError, setSendError] = useState<string>();

  function decide(key: string) {
    whenAccepted(postSlackVerdict(item, key), onAccepted);
  }

  function sendReply() {
    whenSent(postSlackSend(item, reply), onAccepted, setSendError);
  }

  return (
    <article
      className="card"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'r') {
          setComposing(true);
          return;
        }
        decide(event.key);
      }}
    >
      <div className="card-head">
        <span className="card-who">{item.senderName}</span>
        <span className="pill pill-muted">{slackMessageTime(item.timestamp)}</span>
        <span className="pill">{item.workspaceName ?? item.workspaceTeamId}</span>
      </div>
      <p className="card-ask">{item.text}</p>
      {composing && (
        <div className="slack-composer">
          <textarea
            aria-label={`Reply to ${item.senderName}`}
            placeholder={`Reply to ${item.senderName} in Slack`}
            value={reply}
            onChange={(event) => {
              setReply(event.target.value);
            }}
          />
          {sendError !== undefined && <p className="slack-composer-error">{sendError}</p>}
          <div className="slack-composer-actions">
            <span className="hint">{sendPromise}</span>
            <button type="button" className="button button-primary" disabled={reply === ''} onClick={sendReply}>
              Send
            </button>
          </div>
        </div>
      )}
      <div className="card-foot">
        <a href={item.permalink} target="_blank" rel="noreferrer">
          Open in Slack ↗
        </a>
        <span className="spacer" />
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            decide('i');
          }}
        >
          Ignore <Key>i</Key>
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            decide('t');
          }}
        >
          Task <Key>t</Key>
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setComposing(true);
          }}
        >
          Reply <Key>r</Key>
        </button>
      </div>
    </article>
  );
}

function SlackSection({
  items,
  onAccepted,
}: {
  items: SlackTriageItem[];
  onAccepted: (item: SlackTriageItem) => void;
}) {
  return (
    <section aria-label={sectionTitles.slack} className="section">
      <h2 className="section-title">{sectionTitles.slack}</h2>
      {items.map((item) => (
        <SlackCard
          key={`${item.workspaceTeamId}:${item.timestamp}`}
          item={item}
          onAccepted={() => {
            onAccepted(item);
          }}
        />
      ))}
    </section>
  );
}

const chatDecisionKeys: Record<string, string> = { i: 'ignore', t: 'task' };

function postChatVerdict(item: ChatTriageItem, key: string) {
  const decision = chatDecisionKeys[key];
  if (decision === undefined) return;
  const { channel, chatId, messageId } = item;
  return postJson('/chat-verdicts', { channel, chatId, messageId, decision });
}

function postChatSend(item: ChatTriageItem, text: string) {
  const { channel, chatId } = item;
  return postJson('/chat-sends', { channel, chatId, text });
}

function ChatCard({ item, onAccepted }: { item: ChatTriageItem; onAccepted: () => void }) {
  const [composing, setComposing] = useState(false);
  const [reply, setReply] = useState('');
  const [sendError, setSendError] = useState<string>();

  function sendReply() {
    whenSent(postChatSend(item, reply), onAccepted, setSendError);
  }

  function act(key: string) {
    if (key === 'r') {
      setComposing(true);
      return;
    }
    whenAccepted(postChatVerdict(item, key), onAccepted);
  }

  return (
    <article
      className="card"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        act(event.key);
      }}
    >
      <div className="card-head">
        <span className="card-who">{item.chatTitle}</span>
        {item.senderName !== item.chatTitle && <span>{item.senderName}</span>}
        <span className="pill pill-muted">{timeInBusinessZone(item.time)}</span>
        <span className="pill">{channelLabels[item.channel]}</span>
      </div>
      <p className="card-ask">{item.text}</p>
      {composing && (
        <div className="slack-composer">
          <textarea
            aria-label={`Reply to ${item.chatTitle}`}
            placeholder={`Reply to ${item.chatTitle} in ${channelLabels[item.channel]}`}
            value={reply}
            onChange={(event) => {
              setReply(event.target.value);
            }}
          />
          {sendError !== undefined && <p className="slack-composer-error">{sendError}</p>}
          <div className="slack-composer-actions">
            <span className="hint">{sendPromise}</span>
            <button type="button" className="button button-primary" disabled={reply === ''} onClick={sendReply}>
              Send
            </button>
          </div>
        </div>
      )}
      <div className="card-foot">
        <a href={item.link} target="_blank" rel="noreferrer">
          Open in {channelLabels[item.channel]} ↗
        </a>
        <span className="spacer" />
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            act('i');
          }}
        >
          Ignore <Key>i</Key>
        </button>
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
            act('r');
          }}
        >
          Reply <Key>r</Key>
        </button>
      </div>
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

function ChatSection({ items, onAccepted }: { items: ChatTriageItem[]; onAccepted: (item: ChatTriageItem) => void }) {
  return (
    <section aria-label={channelLabels.telegram} className="section">
      <h2 className="section-title">{channelLabels.telegram}</h2>
      {items.map((item) => (
        <ChatCard
          key={`${item.chatId}:${item.messageId}`}
          item={item}
          onAccepted={() => {
            onAccepted(item);
          }}
        />
      ))}
    </section>
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

  function removeDigest(id: Digest['id']) {
    setQueue(
      (current) => current && { ...current, digests: (current.digests ?? []).filter((other) => other.id !== id) },
    );
  }

  function removeHandledItem(messageId: TriageItem['messageId']) {
    setQueue(
      (current) =>
        current && {
          ...current,
          handledForYou: (current.handledForYou ?? []).filter((other) => other.messageId !== messageId),
        },
    );
  }

  function removeSlackItem(item: SlackTriageItem) {
    setQueue(
      (current) => current && { ...current, slackItems: (current.slackItems ?? []).filter((other) => other !== item) },
    );
  }

  function removeChatItem(item: ChatTriageItem) {
    setQueue(
      (current) => current && { ...current, chatItems: (current.chatItems ?? []).filter((other) => other !== item) },
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
      {queue.slackItems !== undefined && <SlackSection items={queue.slackItems} onAccepted={removeSlackItem} />}
      {queue.chatItems !== undefined && <ChatSection items={queue.chatItems} onAccepted={removeChatItem} />}
      <section aria-label={sectionTitles.digests} className="section">
        <h2 className="section-title">{sectionTitles.digests}</h2>
        {queue.digests?.map((digest) => (
          <DigestCard
            key={digest.id}
            digest={digest}
            onAccepted={() => {
              removeDigest(digest.id);
            }}
          />
        ))}
      </section>
      <section aria-label={sectionTitles.needsInput} className="section">
        <h2 className="section-title">{sectionTitles.needsInput}</h2>
        <p className="empty">{nothingNeedsInputText}</p>
      </section>
      <HandledForYouSection items={queue.handledForYou} onUndone={removeHandledItem} />
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
