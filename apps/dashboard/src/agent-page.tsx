import { useState } from 'react';
import type { FormEvent } from 'react';

interface Turn {
  role: string;
  text: string;
}

export function AgentPage() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void fetch('/agent/conversations', {
      method: 'POST',
      body: JSON.stringify({ message: question }),
    })
      .then((response) => response.json() as Promise<{ turns: Turn[] }>)
      .then(({ turns: answered }) => {
        setTurns(answered);
      });
  };

  return (
    <main>
      <header className="page-header">
        <h1 className="page-title">Agent</h1>
      </header>
      <ol>
        {turns.map((turn, index) => (
          <li key={index}>{turn.text}</li>
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
