import { useEffect, useState } from 'react';
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

function sendMessage(path: string, message: string): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

async function readTurns(response: Response): Promise<Turn[]> {
  const { turns } = (await response.json()) as { turns: Turn[] };
  return turns;
}

async function askAgent(message: string): Promise<Turn[]> {
  return readTurns(await sendMessage('/agent/conversations', message));
}

interface ConversationSummary {
  id: string;
  title: string;
}

async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetch('/agent/conversations');
  if (!response.ok) {
    return [];
  }
  const { conversations } = (await response.json()) as { conversations?: ConversationSummary[] };
  return conversations ?? [];
}

async function loadTurns(conversationId: string): Promise<Turn[]> {
  return readTurns(await fetch(`/agent/conversations/${conversationId}`));
}

async function continueConversation(conversationId: string, message: string): Promise<Turn[]> {
  await sendMessage(`/agent/conversations/${conversationId}/messages`, message);
  return loadTurns(conversationId);
}

export function AgentPage() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string>();

  useEffect(() => {
    void listConversations().then(setConversations);
  }, []);

  const choose = (id: string) => {
    setConversationId(id);
    void loadTurns(id).then(setTurns);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const reply = conversationId === undefined ? askAgent(question) : continueConversation(conversationId, question);
    void reply.then(setTurns);
  };

  return (
    <main>
      <header className="page-header">
        <h1 className="page-title">Agent</h1>
      </header>
      <ul>
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => {
                choose(conversation.id);
              }}
            >
              {conversation.title}
            </button>
          </li>
        ))}
      </ul>
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
