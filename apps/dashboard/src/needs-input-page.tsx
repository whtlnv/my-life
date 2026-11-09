import { useEffect, useState } from 'react';

interface Question {
  kind: string;
  senderEmail: string;
  messageId: string;
  accountEmail: string;
  choices: string[];
}

interface TaskProposal {
  id: string;
  title: string;
  accountEmail: string;
}

const confirmKey = 'c';
const rejectKey = 'r';

// One key per answer: the answer's first letter.
function keyOf(choice: string): string {
  return choice.charAt(0);
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

export function NeedsInputPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [proposals, setProposals] = useState<TaskProposal[]>([]);

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
    const answer = (choice: string) => {
      postAnswer(question, choice);
      setQuestions((current) => current.filter((candidate) => candidate !== question));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const choice = question.choices.find((candidate) => keyOf(candidate) === event.key);
      if (choice !== undefined) answer(choice);
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
      const decision = { [confirmKey]: 'confirmation', [rejectKey]: 'rejection' }[event.key];
      if (decision === undefined) return;
      void fetch(`/task-proposals/${proposal.id}/${decision}`, { method: 'POST' });
      setProposals((current) => current.filter((candidate) => candidate !== proposal));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [proposals]);

  return (
    <>
      <ul aria-label="Questions">
        {questions.map((question) => (
          <li key={question.messageId}>
            <span>{question.senderEmail}</span>
            {question.choices.map((choice) => (
              <button key={choice} type="button" aria-keyshortcuts={keyOf(choice)}>
                <kbd>{keyOf(choice)}</kbd> {choice}
              </button>
            ))}
          </li>
        ))}
      </ul>
      <ul aria-label="Task proposals">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            <span>{proposal.title}</span>
            <span>{proposal.accountEmail}</span>
            <button type="button" aria-keyshortcuts={confirmKey}>
              <kbd>{confirmKey}</kbd> confirm
            </button>
            <button type="button" aria-keyshortcuts={rejectKey}>
              <kbd>{rejectKey}</kbd> reject
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
