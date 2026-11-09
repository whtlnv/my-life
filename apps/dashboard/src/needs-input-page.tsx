import { useEffect, useState } from 'react';

interface Question {
  kind: string;
  senderEmail: string;
  messageId: string;
  accountEmail: string;
  choices: string[];
  subject?: string;
  summary?: string;
  from?: string;
  senderName?: string;
  asks?: string[];
}

interface TaskProposal {
  id: string;
  title: string;
  accountEmail: string;
}

const confirmKey = 'c';
const rejectKey = 'r';
const decisionByKey: Record<string, string> = {
  [confirmKey]: 'confirmation',
  [rejectKey]: 'rejection',
};

// One key per answer: its position, counted from 1.
function keyOf(index: number): string {
  return String(index + 1);
}

function postAnswer(question: Question, choice: string): void {
  void fetch('/needs-input/answers', {
    method: 'POST',
    body: JSON.stringify({
      kind: question.kind,
      senderEmail: question.senderEmail,
      messageId: question.messageId,
      answer: choice,
    }),
  });
}

function postDecision(proposal: TaskProposal, decision: string): void {
  void fetch(`/task-proposals/${proposal.id}/${decision}`, { method: 'POST' });
}

export function NeedsInputPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [proposals, setProposals] = useState<TaskProposal[]>([]);

  const answerQuestion = (question: Question, choice: string) => {
    postAnswer(question, choice);
    setQuestions((current) => current.filter((candidate) => candidate !== question));
  };
  const decideProposal = (proposal: TaskProposal, decision: string) => {
    postDecision(proposal, decision);
    setProposals((current) => current.filter((candidate) => candidate !== proposal));
  };

  useEffect(() => {
    void fetch('/needs-input')
      .then((response) => response.json() as Promise<{ questions: Question[] }>)
      .then(({ questions: loaded }) => {
        setQuestions(loaded);
      });
  }, []);

  useEffect(() => {
    const [question] = questions;
    if (question === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const choice = question.choices.find((_candidate, index) => keyOf(index) === event.key);
      if (choice !== undefined) answerQuestion(question, choice);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [questions]);

  useEffect(() => {
    void fetch('/task-proposals').then(async (response) => {
      if (!response.ok) return;
      const { proposals: loaded } = (await response.json()) as { proposals: TaskProposal[] };
      setProposals(loaded);
    });
  }, []);

  useEffect(() => {
    const [proposal] = proposals;
    if (proposal === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const decision = decisionByKey[event.key];
      if (decision === undefined) return;
      decideProposal(proposal, decision);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [proposals]);

  return (
    <main>
      <header className="page-header">
        <h1 className="page-title">Needs input</h1>
        <p className="page-meta">
          The first question answers with its number keys; the first task proposal with c or r
        </p>
      </header>
      <section className="section">
        <h2 className="section-title">
          Questions <span className="count">{questions.length}</span>
        </h2>
        {questions.length === 0 && <p className="empty">No questions waiting</p>}
        <ul aria-label="Questions" className="stack">
          {questions.map((question, position) => (
            <li key={`${question.kind}-${question.messageId}`} className={position === 0 ? 'card card-hero' : 'card'}>
              <div className="card-head">
                <span className="card-who">{question.senderName ?? question.from}</span>
                <span className="pill pill-muted">
                  {question.kind === 'category' ? 'Which category?' : 'VIP or ordinary?'}
                </span>
                <span className="pill" title={question.accountEmail}>
                  {question.accountEmail}
                </span>
              </div>
              {question.subject && <p className="card-ask">{question.subject}</p>}
              {question.summary && <p className="card-summary">{question.summary}</p>}
              {question.asks?.map((ask) => (
                <p key={ask} className="card-ask">
                  <span>{ask}</span>
                </p>
              ))}
              {question.kind === 'new-sender' && <p className="card-summary">{question.senderEmail}</p>}
              <div className="card-foot">
                {question.choices.map((choice, index) => (
                  <button
                    key={choice}
                    type="button"
                    className="button"
                    aria-keyshortcuts={keyOf(index)}
                    onClick={() => {
                      answerQuestion(question, choice);
                    }}
                  >
                    {choice} <kbd>{keyOf(index)}</kbd>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <h2 className="section-title">
          Task proposals <span className="count">{proposals.length}</span>
        </h2>
        {proposals.length === 0 && <p className="empty">No task proposals waiting</p>}
        <div className="card" hidden={proposals.length === 0}>
          <ul aria-label="Task proposals" className="rows">
            {proposals.map((proposal) => (
              <li key={proposal.id} className="row">
                <div className="row-main">
                  <p className="row-title">{proposal.title}</p>
                  <p className="row-detail">{proposal.accountEmail}</p>
                </div>
                <div className="row-side">
                  <button
                    type="button"
                    className="button"
                    aria-keyshortcuts={confirmKey}
                    onClick={() => {
                      decideProposal(proposal, 'confirmation');
                    }}
                  >
                    confirm <kbd>{confirmKey}</kbd>
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    aria-keyshortcuts={rejectKey}
                    onClick={() => {
                      decideProposal(proposal, 'rejection');
                    }}
                  >
                    reject <kbd>{rejectKey}</kbd>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
