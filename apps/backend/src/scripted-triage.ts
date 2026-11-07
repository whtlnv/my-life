interface ScriptedAnswer {
  proposal: unknown;
  costInUsd: number;
}

interface ScriptedTriage {
  propose: (message: { id: string; date: string }) => Promise<ScriptedAnswer | undefined>;
}

export function createScriptedTriage(answers: ScriptedAnswer[]): ScriptedTriage {
  let next = 0;
  return {
    propose: () => Promise.resolve(answers[next++]),
  };
}
