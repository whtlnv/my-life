import { useEffect, useState } from 'react';

import { type AccountReport, businessTimeZone, routes, timeInBusinessZone } from './app-shell';
import { slackContactKey } from './people-page';

interface NowEvent {
  id: string;
  title: string;
  start?: string;
  end?: string;
  meetLink?: string;
  attendees: { email: string; displayName: string }[];
}

interface NextEvent {
  id: string;
  title: string;
  start: string;
}

function minutesUntil(isoTime: string): number {
  return Math.round((new Date(isoTime).getTime() - Date.now()) / 60_000);
}

interface LaterTodayEvent {
  id: string;
  title: string;
  start: string;
  allDay?: boolean;
}

interface NowResponse {
  current: NowEvent[];
  next: NextEvent[];
  laterToday: LaterTodayEvent[];
  accounts: AccountReport[];
}

function todayInBusinessZone(): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: businessTimeZone,
  }).format(new Date());
}

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function NextEventSummary({ event }: { event: NextEvent }) {
  const minutesUntilStart = minutesUntil(event.start);
  return (
    <article className="card card-hero">
      <p className="event-time">
        <span className="pill pill-accent">In {minutesUntilStart} min</span> {timeInBusinessZone(event.start)}
      </p>
      <h2 className="event-title">{event.title}</h2>
    </article>
  );
}

function CurrentEvent({ event }: { event: NowEvent }) {
  return (
    <article className="card card-hero">
      <p className="event-time">
        <span className="pill pill-success">Now</span>
        {event.start && event.end && ` ${timeInBusinessZone(event.start)} – ${timeInBusinessZone(event.end)}`}
      </p>
      <h2 className="event-title">{event.title}</h2>
      {event.attendees.length > 0 && (
        <ul className="event-people">
          {event.attendees.map((attendee) => (
            <li key={attendee.email} className="avatar">
              <i aria-hidden="true">{initials(attendee.displayName)}</i>
              <span>{attendee.displayName}</span>
            </li>
          ))}
        </ul>
      )}
      {event.meetLink && (
        <p className="join">
          <a className="button button-primary" href={event.meetLink}>
            Join Meet
          </a>
        </p>
      )}
    </article>
  );
}

interface RankedTask {
  id: string;
  title: string;
  reason: string;
}

const topTaskCount = 3;

function TopTasks({ tasks, onDone }: { tasks: RankedTask[]; onDone: (taskId: string) => void }) {
  return (
    <section aria-label="Top tasks" className="section">
      <h2 className="section-title">Top tasks</h2>
      <div className="card">
        {tasks.length === 0 && <p className="muted">No ranked tasks yet</p>}
        <ul className="rows">
          {tasks.map((task) => (
            <li key={task.id} className="row">
              <div className="row-main">
                <p className="row-title">{task.title}</p>
                <p className="row-detail">{task.reason}</p>
              </div>
              <div className="row-side">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => {
                    onDone(task.id);
                  }}
                >
                  Done
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

interface WaitingPerson {
  email: string;
  displayName: string;
  slackHandles?: { workspaceTeamId: string; userId: string }[];
  telegramHandles?: { userId: string }[];
  waitingSince: string;
}

function longestWaitFirst(people: WaitingPerson[]): WaitingPerson[] {
  return [...people].sort((first, second) => first.waitingSince.localeCompare(second.waitingSince));
}

const millisecondsPerDay = 86_400_000;

const millisecondsPerHour = 3_600_000;

export function waitingDurationText(waitingSince: string, now: Date): string {
  const waitedMilliseconds = now.getTime() - new Date(waitingSince).getTime();
  const days = Math.floor(waitedMilliseconds / millisecondsPerDay);
  const hours = Math.floor(waitedMilliseconds / millisecondsPerHour);
  if (days === 0) return hours === 0 ? '< 1 h' : `${String(hours)} h`;
  return days === 1 ? '1 day' : `${String(days)} days`;
}

const waitingContactKey = (person: WaitingPerson): string => {
  const [telegramHandle] = person.telegramHandles ?? [];
  if (telegramHandle !== undefined) return `telegram:${telegramHandle.userId}`;
  const [slackHandle] = person.slackHandles ?? [];
  if (slackHandle !== undefined) return slackContactKey(slackHandle);
  return person.email;
};

function WaitingOnYou({ people }: { people: WaitingPerson[] }) {
  return (
    <section aria-label="Waiting on you" className="section">
      <h2 className="section-title">Waiting on you</h2>
      <div className="card">
        {people.length === 0 && <p className="muted">Nobody is waiting on you</p>}
        <ul className="rows">
          {people.map((person) => (
            <li key={person.email} className="row">
              <div className="row-main">
                <p className="row-title">
                  <a href={`${routes.people}?contact=${encodeURIComponent(waitingContactKey(person))}`}>{person.displayName}</a>
                </p>
              </div>
              <div className="row-side">
                <span>{waitingDurationText(person.waitingSince, new Date())}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const nowRefreshIntervalMilliseconds = 60_000;

const emptyNowResponse: NowResponse = { current: [], next: [], laterToday: [], accounts: [] };

export function DashboardApp() {
  const [nowResponse, setNowResponse] = useState<NowResponse | null>(null);
  const [backendUnreachable, setBackendUnreachable] = useState(false);
  const [topTasks, setTopTasks] = useState<RankedTask[]>([]);
  const [waitingPeople, setWaitingPeople] = useState<WaitingPerson[]>([]);

  useEffect(() => {
    const loadNow = () =>
      void fetch('/now')
        .then((response) => response.json() as Promise<NowResponse>)
        .then(setNowResponse)
        .catch(() => {
          setBackendUnreachable(true);
        });
    loadNow();
    const interval = setInterval(loadNow, nowRefreshIntervalMilliseconds);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    void fetch('/tasks')
      .then((response) => response.json() as Promise<{ tasks: RankedTask[] }>)
      .then(({ tasks }) => {
        setTopTasks(tasks.slice(0, topTaskCount));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch('/waiting-on')
      .then((response) => response.json() as Promise<{ people: WaitingPerson[] }>)
      .then(({ people }) => {
        setWaitingPeople(longestWaitFirst(people));
      })
      .catch(() => undefined);
  }, []);

  const markTaskDone = (taskId: string) => {
    void fetch(`/tasks/${encodeURIComponent(taskId)}/done`, { method: 'POST' }).then((response) => {
      if (!response.ok) return;
      setTopTasks((tasks) => tasks.filter((task) => task.id !== taskId));
    });
  };

  const loaded = nowResponse !== null;
  const { current, next, laterToday, accounts } = nowResponse ?? emptyNowResponse;
  const loading = !loaded && !backendUnreachable;
  const nothingToShow = loaded && current.length === 0 && next.length === 0;

  return (
    <main>
      <header className="page-header">
        <h1 className="page-title">Now</h1>
        <p className="page-meta">{todayInBusinessZone()}</p>
      </header>
      <div className="now-grid">
        <div>
          <section aria-label="Now">
            <h2 className="section-title">Now</h2>
            {loading && <p className="empty">Loading</p>}
            {backendUnreachable && (
              <p className="empty">
                <strong>The backend cannot be reached</strong>
                Is the launchd agent running?
              </p>
            )}
            {nothingToShow && (
              <p className="empty">
                <strong>Nothing now</strong>
                The next event appears here 15 minutes before it starts.
              </p>
            )}
            {current.map((event) => (
              <CurrentEvent key={event.id} event={event} />
            ))}
            {next.map((event) => (
              <NextEventSummary key={event.id} event={event} />
            ))}
          </section>
          <TopTasks tasks={topTasks} onDone={markTaskDone} />
          <WaitingOnYou people={waitingPeople} />
          <section aria-label="Later today" className="section">
            <h2 className="section-title">Later today</h2>
            {loaded && laterToday.length === 0 && <p className="empty">Nothing else today</p>}
            {laterToday.length > 0 && (
              <ul className="timeline">
                {laterToday.map((event) => (
                  <li key={event.id}>
                    <span className={event.allDay ? 'time all-day' : 'time'}>
                      {event.allDay ? 'All day' : timeInBusinessZone(event.start)}
                    </span>
                    <span>{event.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside>
          <section aria-label="Accounts" className="card">
            <h2 className="section-title">Calendars</h2>
            <ul className="accounts">
              {accounts.map((account) => (
                <li key={account.email}>
                  <span className="email" title={account.email}>
                    {account.email}
                  </span>
                  <span className="time">{timeInBusinessZone(account.lastReportedAt)}</span>
                  {account.stale ? <span className="pill pill-warning">stale</span> : <span className="dot" />}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
