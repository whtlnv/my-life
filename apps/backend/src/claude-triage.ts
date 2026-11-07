interface ClaudeTriageDependencies {
  model: string;
  createMessage: (request: { model: string }) => Promise<unknown>;
}

export function createClaudeTriage({ model, createMessage }: ClaudeTriageDependencies) {
  return {
    propose: async (_message: { id: string; date: string }): Promise<void> => {
      await createMessage({ model });
    },
  };
}
