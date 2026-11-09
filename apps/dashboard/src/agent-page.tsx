import { useState } from 'react';
import type { FormEvent } from 'react';

export const unverifiedCitationText = 'Unverified citation';

interface Citation {
  id: string;
  subject?: string;
  link?: string;
  verified?: boolean;
}

interface Turn {
  role: string;
  text: string;
  citations?: Citation[];
}

function CitationView({ citation }: { citation: Citation }) {
  if (citation.verified === false) {
    return <span>{unverifiedCitationText}</span>;
  }
  return <a href={citation.link}>{citation.subject}</a>;
}

async function askAgent(message: string): Promise<Turn[]> {
  const response = await fetch('/agent/conversations', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
  const { turns } = (await response.json()) as { turns: Turn[] };
  return turns;
}

export function AgentPage() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void askAgent(question).then(setTurns);
  };

  return (
    <main>
      <header className="page-header">
        <h1 className="page-title">Agent</h1>
      </header>
      <ol>
        {turns.map((turn, index) => (
          <li key={index}>
            {turn.text}
            {turn.citations?.map((citation) => (
              <CitationView key={citation.id} citation={citation} />
            ))}
          </li>
        ))}
      </ol>
      <form onSubmit={onSubmit}>
        <input
          type="text"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
        />
      </form>
    </main>
  );
}
