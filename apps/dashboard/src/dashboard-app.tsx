import { useEffect, useState } from 'react';

import { routes } from './app-shell';

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

interface AccountReport {
  email: string;
  lastReportedAt: string;
  stale: boolean;
}

interface NowResponse {
  current: NowEvent[];
  next: NextEvent[];
  laterToday: LaterTodayEvent[];
  accounts: AccountReport[];
}

const businessTimeZone = 'America/Mexico_City';

function timeInBusinessZone(isoTime: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: businessTimeZone }).format(
    new Date(isoTime),
  );
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
      <ul className="timeline">
        {tasks.map((task) => (
          <li key={task.id}>
            <span>{task.title}</span>
            <span>{task.reason}</span>
            <button
              type="button"
              onClick={() => {
                onDone(task.id);
              }}
            >
              Done
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface WaitingPerson {
  email: string;
  displayName: string;
  waitingSince: string;
}

function longestWaitFirst(people: WaitingPerson[]): WaitingPerson[] {
  return [...people].sort((first, second) => first.waitingSince.localeCompare(second.waitingSince));
}

function WaitingOnYou({ people }: { people: WaitingPerson[] }) {
  return (
    <section aria-label="Waiting on you" className="section">
      <h2 className="section-title">Waiting on you</h2>
      <ul className="timeline">
        {people.map((person) => (
          <li key={person.email}>
            <a href={`${routes.people}?contact=${encodeURIComponent(person.email)}`}>{person.displayName}</a>
          </li>
        ))}
      </ul>
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
    void fetch(`/tasks/${taskId}/done`, { method: 'POST' }).then(() => {
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
