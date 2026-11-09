import { useEffect, useState } from 'react';

import { businessTimeZone } from './app-shell';

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

const weekdayAndTimeInBusinessZone = (isoTime: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: businessTimeZone,
  }).format(new Date(isoTime));

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
  <section className="section">
    <h2 className="section-title">
      {title} <span className="count">{people.length}</span>
    </h2>
    <div className="card">
      {people.length === 0 && <p className="muted">Nobody here</p>}
      <ul aria-label={title} className="rows">
        {people.map((person) => (
          <li key={person.displayName} className="row">
            <div className="row-main">
              <p className="row-title">
                <button
                  type="button"
                  className="row-link"
                  onClick={() => {
                    onSelect(person);
                  }}
                >
                  {person.displayName}
                </button>{' '}
                {person.reasons?.map((reason) => (
                  <span key={reason} className="pill pill-danger">
                    {reason}
                  </span>
                ))}
              </p>
              <p className="row-detail">
                {person.organization && (
                  <>
                    <button
                      type="button"
                      className="row-link"
                      onClick={() => {
                        onSelectOrganization(person.organization);
                      }}
                    >
                      {person.organization}
                    </button>
                    {' · '}
                  </>
                )}
                last message{' '}
                <time dateTime={person.lastMessageAt}>{weekdayAndTimeInBusinessZone(person.lastMessageAt)}</time>
              </p>
            </div>
            <div className="row-side">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => {
                  vipAction.onClick(person);
                }}
              >
                {vipAction.label}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

const ContactTimeline = ({ timeline }: { timeline: SelectedTimeline }) => (
  <section className="section">
    <h2 className="section-title">{timeline.displayName}</h2>
    <div className="card">
      <ul aria-label={`Timeline of ${timeline.displayName}`} className="rows">
        {timeline.messages.map((message) => (
          <li key={message.id} className="row">
            <div className="row-main">
              <p className="row-title">
                <a href={message.link} target="_blank" rel="noreferrer">
                  {message.subject}
                </a>
              </p>
            </div>
            <div className="row-side">{message.accountEmail}</div>
          </li>
        ))}
      </ul>
    </div>
  </section>
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
    void fetch(`/contacts/${encodeURIComponent(person.emails[0] ?? '')}/marks/vip`, { method }).then(loadPeople);
  };
  const markVip = { label: 'Mark VIP', onClick: setVipMark('PUT') };
  const removeVip = { label: 'Remove VIP', onClick: setVipMark('DELETE') };

  const loadTimeline = (path: string, displayName: string) => {
    void fetch(path)
      .then((response) => response.json() as Promise<Timeline>)
      .then((timeline) => {
        setSelected({ ...timeline, displayName });
      });
  };

  const showTimeline = (person: PersonRow) => {
    loadTimeline(`/contacts/${encodeURIComponent(person.emails[0] ?? '')}/timeline`, person.displayName);
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
      <header className="page-header">
        <h1 className="page-title">People</h1>
      </header>
      <div className="now-grid">
        <div>
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
        </div>
        <aside>
          {selected ? (
            <ContactTimeline timeline={selected} />
          ) : (
            <p className="empty">Pick a person or an organization to see their timeline</p>
          )}
        </aside>
      </div>
    </main>
  );
};
