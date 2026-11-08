interface MessagePart {
  mimeType: string;
  body: { size: number; data?: string };
  parts?: MessagePart[];
}

export function messageBody(payload: MessagePart): string {
  const plainPart = payload.parts?.find((part) => part.mimeType === 'text/plain');
  if (plainPart) {
    return messageBody(plainPart);
  }
  const text = Buffer.from(payload.body.data ?? '', 'base64url').toString('utf8');
  if (payload.mimeType === 'text/html') {
    return withoutTags(text);
  }
  return withoutQuotedReply(text);
}

function withoutQuotedReply(text: string): string {
  return text.replace(/\n\nOn .* wrote:\n(?:>.*\n)+/, '\n');
}

function withoutTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
