import { useEffect, useState } from 'react';

type NowEvent = {
  id: string;
  title: string;
  meetLink: string;
  attendees: { email: string; displayName: string }[];
};

type NextEvent = {
  id: string;
  title: string;
  start: string;
};

function minutesUntil(isoTime: string): number {
  return Math.round((new Date(isoTime).getTime() - Date.now()) / 60_000);
}

type LaterTodayEvent = {
  id: string;
  title: string;
  start: string;
};

type AccountReport = {
  email: string;
  lastReportedAt: string;
};

type NowResponse = {
  current: NowEvent[];
  next: NextEvent[];
  laterToday: LaterTodayEvent[];
  accounts: AccountReport[];
};

function startTimeInBusinessZone(isoTime: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date(isoTime));
}

function NextEventSummary({ event }: { event: NextEvent }) {
  const minutesUntilStart = minutesUntil(event.start);
  return (
    <article>
      <h2>{event.title}</h2>
      <p>In {minutesUntilStart} min</p>
    </article>
  );
}

function CurrentEvent({ event }: { event: NowEvent }) {
  return (
    <article>
      <h2>{event.title}</h2>
      <a href={event.meetLink}>Join</a>
      <p>{event.attendees.map((attendee) => attendee.displayName).join(', ')}</p>
    </article>
  );
}

export function DashboardApp() {
  const [current, setCurrent] = useState<NowEvent[]>([]);
  const [next, setNext] = useState<NextEvent[]>([]);
  const [laterToday, setLaterToday] = useState<LaterTodayEvent[]>([]);
  const [accounts, setAccounts] = useState<AccountReport[]>([]);

  useEffect(() => {
    void fetch('/now')
      .then((response) => response.json() as Promise<NowResponse>)
      .then((body) => {
        setCurrent(body.current);
        setNext(body.next);
        setLaterToday(body.laterToday);
        setAccounts(body.accounts);
      })
      .catch(() => undefined);
  }, []);

  const nothingToShow = current.length === 0 && next.length === 0;

  return (
    <main>
      <h1>my-life</h1>
      <section aria-label="Now">
        {nothingToShow && <p>Nothing now</p>}
        {current.map((event) => (
          <CurrentEvent key={event.id} event={event} />
        ))}
        {next.map((event) => (
          <NextEventSummary key={event.id} event={event} />
        ))}
      </section>
      <section aria-label="Later today">
        <ul>
          {laterToday.map((event) => (
            <li key={event.id}>
              {startTimeInBusinessZone(event.start)} {event.title}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Accounts">
        <ul>
          {accounts.map((account) => (
            <li key={account.email}>
              {account.email} {startTimeInBusinessZone(account.lastReportedAt)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
