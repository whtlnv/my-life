import { useEffect, useState } from 'react';

type NowEvent = {
  id: string;
  title: string;
  meetLink: string;
  attendees: { email: string; displayName: string }[];
};

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

  useEffect(() => {
    void fetch('/now')
      .then((response) => response.json() as Promise<{ current: NowEvent[] }>)
      .then((body) => {
        setCurrent(body.current);
      })
      .catch(() => undefined);
  }, []);

  return (
    <main>
      <h1>my-life</h1>
      <section aria-label="Now">
        {current.length === 0 && <p>Nothing now</p>}
        {current.map((event) => (
          <CurrentEvent key={event.id} event={event} />
        ))}
      </section>
    </main>
  );
}
