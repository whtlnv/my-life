import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';

import { businessTimeZone } from './app-shell';

export const unverifiedCitationText = 'Unverified citation';
export const agentActionsHeading = 'What the agent did';
export const undoneActionText = 'Undone';

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
    return (
      <span className="pill pill-warning" title={citation.id}>
        {unverifiedCitationText}
      </span>
    );
  }
  return (
    <a className="pill pill-accent" href={citation.link}>
      {citation.subject}
    </a>
  );
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

async function askAgent(message: string): Promise<{ id: string; turns: Turn[] }> {
  return (await (await sendMessage('/agent/conversations', message)).json()) as { id: string; turns: Turn[] };
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

interface AgentAction {
  id: string;
  tool: string;
  target: string;
  conversationId?: string;
  at?: string;
  undoable: boolean;
  undone?: boolean;
  outcome?: 'refused';
}

const actionDescriptions: Record<string, string> = {
  archive_message: 'Archived a message',
  label_message: 'Labeled a message',
  write_draft: 'Wrote a draft reply',
  create_task: 'Created a task',
  mark_vip: 'Marked a contact VIP',
  update_contact: 'Updated a contact',
  approve_filter_proposal: 'Approved a filter',
  reject_filter_proposal: 'Rejected a filter',
  send_message: 'Asked to send a message',
  delete_message: 'Asked to delete a message',
};

function actionTime(at: string | undefined): string {
  if (at === undefined) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: businessTimeZone,
  }).format(new Date(at));
}

async function listActions(): Promise<AgentAction[]> {
  const response = await fetch('/agent/actions');
  if (!response.ok) {
    return [];
  }
  const { actions } = (await response.json()) as { actions?: AgentAction[] };
  return actions ?? [];
}

async function undoAction(actionId: string): Promise<void> {
  await fetch('/agent/actions/undo', { method: 'POST', body: JSON.stringify({ actionId }) });
}

function ActionUndoControl({ action, undone, onUndo }: { action: AgentAction; undone: boolean; onUndo: () => void }) {
  if (action.outcome === 'refused') {
    return <span className="pill pill-danger">Refused</span>;
  }
  if (undone) {
    return <span className="pill pill-muted">{undoneActionText}</span>;
  }
  if (!action.undoable) {
    return null;
  }
  return (
    <button type="button" className="button button-quiet" onClick={onUndo}>
      Undo
    </button>
  );
}

function AgentActions() {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [undoneIds, setUndoneIds] = useState<string[]>([]);

  useEffect(() => {
    void listActions().then(setActions);
  }, []);

  const undo = (actionId: string) => {
    void undoAction(actionId).then(() => {
      setUndoneIds((ids) => [...ids, actionId]);
    });
  };

  return (
    <section className="section" aria-labelledby="agent-actions-heading">
      <h2 id="agent-actions-heading" className="section-title">
        {agentActionsHeading}
      </h2>
      {actions.length === 0 ? (
        <p className="empty">The agent has not acted yet.</p>
      ) : (
        <ul className="card rows">
          {actions.map((action) => (
            <li key={action.id} className="row">
              <div className="row-main">
                <p className="row-title">{actionDescriptions[action.tool] ?? action.tool}</p>
                <p className="row-detail">
                  {action.target}
                  {action.conversationId === undefined ? '' : ` · ${action.conversationId}`}
                </p>
              </div>
              <div className="row-side">
                <span>{actionTime(action.at)}</span>
                <ActionUndoControl
                  action={action}
                  undone={action.undone === true || undoneIds.includes(action.id)}
                  onUndo={() => {
                    undo(action.id);
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const reply =
      conversationId === undefined
        ? askAgent(question).then((conversation) => {
            setConversationId(conversation.id);
            return conversation.turns;
          })
        : continueConversation(conversationId, question);
    setQuestion('');
    void reply.then(setTurns);
  };

  return (
    <main>
      <header className="page-header">
        <h1 className="page-title">Agent</h1>
        <p className="page-meta">Asks Claude about your mail, people, calendar and tasks. It never sends or deletes.</p>
      </header>
      <div className="agent-layout">
        <nav aria-label="Conversations" className="agent-conversations">
          <p className="section-title">Conversations</p>
          <ul>
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={conversation.id === conversationId ? 'agent-conversation is-active' : 'agent-conversation'}
                  aria-current={conversation.id === conversationId}
                  onClick={() => {
                    choose(conversation.id);
                  }}
                >
                  {conversation.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section className="card agent-chat" aria-label="Conversation">
          {turns.length === 0 ? (
            <p className="row-detail">Ask a question, or open a past conversation.</p>
          ) : (
            <ol className="agent-turns">
              {turns.map((turn, index) => (
                <li key={index} className={turn.role === 'user' ? 'agent-turn agent-turn-user' : 'agent-turn'}>
                  <p>{turn.text}</p>
                  {turn.citations !== undefined && turn.citations.length > 0 && (
                    <p className="agent-citations">
                      {turn.citations.map((citation) => (
                        <CitationView key={citation.id} citation={citation} />
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          <form className="agent-composer" onSubmit={onSubmit}>
            <input
              type="text"
              aria-label="Question"
              placeholder={conversationId === undefined ? 'Ask the agent…' : 'Continue this conversation…'}
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
              }}
            />
          </form>
        </section>
      </div>
      <AgentActions />
    </main>
  );
}
