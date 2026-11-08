import { useEffect, useState } from 'react';

interface PersonRow {
  displayName: string;
  emails: string[];
  organization: string;
  lastMessageAt: string;
  reasons?: string[];
}

interface PeopleLists {
  vip: PersonRow[];
  urgent: PersonRow[];
  everyoneElse: PersonRow[];
}

interface TimelineMessage {
  id: string;
  subject: string;
  accountEmail: string;
  link: string;
}

interface Timeline {
  messages: TimelineMessage[];
}

interface SelectedTimeline {
  displayName: string;
  messages: TimelineMessage[];
}

const emptyLists: PeopleLists = { vip: [], urgent: [], everyoneElse: [] };

const timeInBusinessZone = (isoTime: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(
    new Date(isoTime),
  );

const PeopleList = ({
  title,
  people,
  onSelect,
}: {
  title: string;
  people: PersonRow[];
  onSelect: (person: PersonRow) => void;
}) => (
  <section>
    <h2>{title}</h2>
    <ul aria-label={title}>
      {people.map((person) => (
        <li key={person.displayName}>
          <button type="button" onClick={() => onSelect(person)}>
            {person.displayName}
          </button>{' '}
          {person.organization}{' '}
          <time dateTime={person.lastMessageAt}>{timeInBusinessZone(person.lastMessageAt)}</time>{' '}
          {person.reasons?.join(', ')}
        </li>
      ))}
    </ul>
  </section>
);

export const PeoplePage = () => {
  const [lists, setLists] = useState<PeopleLists>(emptyLists);
  const [selected, setSelected] = useState<SelectedTimeline | undefined>(undefined);

  useEffect(() => {
    void fetch('/people')
      .then((response) => response.json() as Promise<PeopleLists>)
      .then(setLists);
  }, []);

  const showTimeline = (person: PersonRow) => {
    void fetch(`/contacts/${encodeURIComponent(person.emails[0] as string)}/timeline`)
      .then((response) => response.json() as Promise<Timeline>)
      .then((timeline) => setSelected({ displayName: person.displayName, messages: timeline.messages }));
  };

  return (
    <main>
      <PeopleList title="VIP" people={lists.vip} onSelect={showTimeline} />
      <PeopleList title="Urgent" people={lists.urgent} onSelect={showTimeline} />
      <PeopleList title="Everyone else" people={lists.everyoneElse} onSelect={showTimeline} />
      {selected && (
        <ul aria-label={`Timeline of ${selected.displayName}`}>
          {selected.messages.map((message) => (
            <li key={message.id}>
              <a href={message.link}>{message.subject}</a> {message.accountEmail}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
