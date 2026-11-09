import { useEffect, useState } from 'react';

interface Question {
  kind: string;
  senderEmail: string;
  messageId: string;
  accountEmail: string;
  choices: string[];
}

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

  return (
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
  );
}
