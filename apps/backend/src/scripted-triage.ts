interface ScriptedAnswer {
  proposal: unknown;
  costInUsd: number;
}

export function createScriptedTriage(answers: ScriptedAnswer[]) {
  let next = 0;
  return {
    propose: async (_message: { id: string; date: string }): Promise<ScriptedAnswer> => answers[next++]!,
  };
}
