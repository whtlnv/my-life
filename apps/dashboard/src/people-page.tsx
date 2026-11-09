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

interface SelectedTimeline extends Timeline {
  displayName: string;
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
  onSelectOrganization,
  vipAction,
}: {
  title: string;
  people: PersonRow[];
  onSelect: (person: PersonRow) => void;
  onSelectOrganization: (organization: string) => void;
  vipAction: { label: string; onClick: (person: PersonRow) => void };
}) => (
  <section>
    <h2>{title}</h2>
    <ul aria-label={title}>
      {people.map((person) => (
        <li key={person.displayName}>
          <button type="button" onClick={() => onSelect(person)}>
            {person.displayName}
          </button>{' '}
          <button type="button" onClick={() => onSelectOrganization(person.organization)}>
            {person.organization}
          </button>{' '}
          <time dateTime={person.lastMessageAt}>{timeInBusinessZone(person.lastMessageAt)}</time>{' '}
          {person.reasons?.join(', ')}{' '}
          <button type="button" onClick={() => vipAction.onClick(person)}>
            {vipAction.label}
          </button>
        </li>
      ))}
    </ul>
  </section>
);

const ContactTimeline = ({ timeline }: { timeline: SelectedTimeline }) => (
  <ul aria-label={`Timeline of ${timeline.displayName}`}>
    {timeline.messages.map((message) => (
      <li key={message.id}>
        <a href={message.link}>{message.subject}</a> {message.accountEmail}
      </li>
    ))}
  </ul>
);

const personRequestedByLocation = (lists: PeopleLists): PersonRow | undefined => {
  const contact = new URLSearchParams(window.location.hash.split('?')[1]).get('contact');
  if (contact === null) return undefined;
  return [...lists.vip, ...lists.urgent, ...lists.everyoneElse].find((candidate) => candidate.emails.includes(contact));
};

export const PeoplePage = () => {
  const [lists, setLists] = useState<PeopleLists>(emptyLists);
  const [selected, setSelected] = useState<SelectedTimeline | undefined>(undefined);

  const fetchPeople = () =>
    fetch('/people')
      .then((response) => response.json() as Promise<PeopleLists>)
      .then((loaded) => {
        setLists(loaded);
        return loaded;
      });

  const loadPeople = () => {
    void fetchPeople();
  };

  const setVipMark = (method: 'PUT' | 'DELETE') => (person: PersonRow) => {
    void fetch(`/contacts/${encodeURIComponent(person.emails[0] as string)}/marks/vip`, { method }).then(loadPeople);
  };
  const markVip = { label: 'Mark VIP', onClick: setVipMark('PUT') };
  const removeVip = { label: 'Remove VIP', onClick: setVipMark('DELETE') };

  const loadTimeline = (path: string, displayName: string) => {
    void fetch(path)
      .then((response) => response.json() as Promise<Timeline>)
      .then((timeline) => setSelected({ ...timeline, displayName }));
  };

  const showTimeline = (person: PersonRow) => {
    loadTimeline(`/contacts/${encodeURIComponent(person.emails[0] as string)}/timeline`, person.displayName);
  };

  useEffect(() => {
    void fetchPeople().then((loaded) => {
      const person = personRequestedByLocation(loaded);
      if (person) showTimeline(person);
    });
  }, []);

  const showOrganizationTimeline = (organization: string) => {
    loadTimeline(`/organizations/${encodeURIComponent(organization)}/timeline`, organization);
  };

  return (
    <main>
      <PeopleList
        title="VIP"
        people={lists.vip}
        onSelect={showTimeline}
        onSelectOrganization={showOrganizationTimeline}
        vipAction={removeVip}
      />
      <PeopleList
        title="Urgent"
        people={lists.urgent}
        onSelect={showTimeline}
        onSelectOrganization={showOrganizationTimeline}
        vipAction={markVip}
      />
      <PeopleList
        title="Everyone else"
        people={lists.everyoneElse}
        onSelect={showTimeline}
        onSelectOrganization={showOrganizationTimeline}
        vipAction={markVip}
      />
      {selected && <ContactTimeline timeline={selected} />}
    </main>
  );
};
