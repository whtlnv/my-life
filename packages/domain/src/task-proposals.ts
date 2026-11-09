export interface ExtractedAsk {
  ask: string;
  due?: string;
}

export interface MessageWithAsks {
  accountEmail: string;
  link: string;
  asks?: ExtractedAsk[];
}

export interface TaskProposal {
  title: string;
  due?: string;
  link: string;
  accountEmail: string;
}

export const taskProposals = (message: MessageWithAsks): TaskProposal[] =>
  (message.asks ?? []).map(({ ask, ...rest }) => ({
    title: ask,
    ...rest,
    link: message.link,
    accountEmail: message.accountEmail,
  }));
