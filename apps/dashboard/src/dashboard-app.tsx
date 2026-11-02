import { useEffect, useState } from 'react';

type NowEvent = {
  id: string;
  title: string;
  meetLink: string;
  attendees: { email: string; displayName: string }[];
};

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
        {current.map((event) => (
          <article key={event.id}>
            <h2>{event.title}</h2>
            <a href={event.meetLink}>Join</a>
            <p>{event.attendees.map((attendee) => attendee.displayName).join(', ')}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
