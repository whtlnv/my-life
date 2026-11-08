import { useEffect, useState } from 'react';

interface PersonRow {
  displayName: string;
  organization: string;
  lastMessageAt: string;
  reasons?: string[];
}

interface PeopleLists {
  vip: PersonRow[];
  urgent: PersonRow[];
  everyoneElse: PersonRow[];
}

const emptyLists: PeopleLists = { vip: [], urgent: [], everyoneElse: [] };

const timeInBusinessZone = (isoTime: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(
    new Date(isoTime),
  );

const PeopleList = ({ title, people }: { title: string; people: PersonRow[] }) => (
  <section>
    <h2>{title}</h2>
    <ul aria-label={title}>
      {people.map((person) => (
        <li key={person.displayName}>
          {person.displayName} {person.organization}{' '}
          <time dateTime={person.lastMessageAt}>{timeInBusinessZone(person.lastMessageAt)}</time>{' '}
          {person.reasons?.join(', ')}
        </li>
      ))}
    </ul>
  </section>
);

export const PeoplePage = () => {
  const [lists, setLists] = useState<PeopleLists>(emptyLists);

  useEffect(() => {
    void fetch('/people')
      .then((response) => response.json() as Promise<PeopleLists>)
      .then(setLists);
  }, []);

  return (
    <main>
      <PeopleList title="VIP" people={lists.vip} />
      <PeopleList title="Urgent" people={lists.urgent} />
      <PeopleList title="Everyone else" people={lists.everyoneElse} />
    </main>
  );
};
