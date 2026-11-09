import { useEffect, useState, type ReactNode } from 'react';

import { accountName } from './account-name';

interface SourceStatus {
  email: string;
  source: 'mail' | 'calendar';
  lastReportedAt: string;
  stale: boolean;
}

interface AccountReport {
  email: string;
  lastReportedAt: string;
  stale: boolean;
}

interface ShellStatus {
  badgeCount: number;
  accounts: AccountReport[];
  sources: SourceStatus[];
}

interface AccountStatus {
  email: string;
  mail?: SourceStatus;
  calendar?: SourceStatus;
}

const statusRefreshIntervalMilliseconds = 60_000;
const emptyStatus: ShellStatus = { badgeCount: 0, accounts: [], sources: [] };

export const routes = {
  now: '#/',
  people: '#/people',
  triage: '#/triage',
  needsInput: '#/needs-input',
  categories: '#/categories',
  filters: '#/filters',
  statement: '#/statement',
} as const;

function timeInBusinessZone(isoTime: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date(isoTime));
}

// One status per account: its calendar report (`accounts`, the calendar snapshots) and its mail report (`sources`).
function accountStatuses({ accounts, sources }: ShellStatus): AccountStatus[] {
  const byEmail = new Map<string, AccountStatus>();
  const statusOf = (email: string) => {
    const existing = byEmail.get(email);
    if (existing) return existing;
    const created: AccountStatus = { email };
    byEmail.set(email, created);
    return created;
  };
  for (const account of accounts) statusOf(account.email).calendar = { ...account, source: 'calendar' };
  for (const source of sources) statusOf(source.email)[source.source] = source;
  return [...byEmail.values()];
}

function describeSource(source: SourceStatus | undefined, label: string): string {
  return source === undefined ? `${label} never` : `${label} ${timeInBusinessZone(source.lastReportedAt)}`;
}

// Compact on purpose: the dot carries the state, the tooltip the times. A stale source is named so the chip says
// what is wrong without opening the Now page.
function AccountChip({ account }: { account: AccountStatus }) {
  const staleSources = (['calendar', 'mail'] as const).filter((source) => account[source]?.stale === true);
  const stale = staleSources.length > 0;
  const title = `${account.email} · ${describeSource(account.calendar, 'calendar')} · ${describeSource(account.mail, 'mail')}`;
  return (
    <li className={stale ? 'chip chip-source is-stale' : 'chip chip-source is-fresh'} title={title}>
      <span className="dot" aria-hidden="true" />
      <span className="chip-account">{accountName(account.email)}</span>
      {stale && <span className="chip-detail is-stale">{staleSources.join(' + ')} stale</span>}
      <span className="visually-hidden">{account.email}</span>
    </li>
  );
}

function Tab({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <a className="tab" href={href} aria-current={current ? 'page' : undefined}>
      {children}
    </a>
  );
}

// The frame every page shares (CLAUDE.md locked decision 10): the wordmark, the page tabs, and one chip per account
// so a stale account is visible from anywhere.
export function AppShell({ route, children }: { route: string; children: ReactNode }) {
  const [status, setStatus] = useState<ShellStatus>(emptyStatus);
  const [unansweredQuestions, setUnansweredQuestions] = useState(0);

  useEffect(() => {
    const loadStatus = () =>
      void fetch('/now')
        .then((response) => response.json() as Promise<ShellStatus>)
        .then(setStatus)
        .catch(() => undefined);
    const loadUnansweredQuestions = () =>
      void fetch('/needs-input')
        .then((response) => response.json() as Promise<{ questions: unknown[] }>)
        .then(({ questions }) => {
          setUnansweredQuestions(questions.length);
        })
        .catch(() => undefined);
    loadStatus();
    loadUnansweredQuestions();
    const interval = setInterval(loadStatus, statusRefreshIntervalMilliseconds);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const onNow = !Object.values(routes).some((href) => href !== routes.now && href === route);
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href={routes.now}>
            my-life
          </a>
          <nav className="tabs" aria-label="Pages">
            <Tab href={routes.now} current={onNow}>
              Now
            </Tab>
            <Tab href={routes.people} current={route === routes.people}>
              People
            </Tab>
            <Tab href={routes.triage} current={route === routes.triage}>
              Triage
              {status.badgeCount > 0 && <span className="count">{status.badgeCount}</span>}
            </Tab>
            <Tab href={routes.needsInput} current={route === routes.needsInput}>
              Needs input
              {unansweredQuestions > 0 && <span className="count">{unansweredQuestions}</span>}
            </Tab>
            <Tab href={routes.categories} current={route === routes.categories}>
              Categories
            </Tab>
            <Tab href={routes.filters} current={route === routes.filters}>
              Filters
            </Tab>
            <Tab href={routes.statement} current={route === routes.statement}>
              Statement
            </Tab>
          </nav>
          <ul className="sources" aria-label="Sources">
            {accountStatuses(status).map((account) => (
              <AccountChip key={account.email} account={account} />
            ))}
          </ul>
        </div>
      </header>
      <div className="page">{children}</div>
    </div>
  );
}
