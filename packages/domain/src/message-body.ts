interface MessagePart {
  mimeType: string;
  filename?: string;
  body: { size: number; data?: string };
  parts?: MessagePart[];
}

const maximumBodyLength = 20 * 1024;

export function messageBody(payload: MessagePart): string {
  const bodyPart =
    payload.parts?.find((part) => part.mimeType === 'text/plain' && !part.filename) ??
    payload.parts?.find((part) => part.mimeType === 'text/html' && !part.filename) ??
    payload.parts?.find((part) => part.mimeType.startsWith('multipart/'));
  if (bodyPart) {
    return messageBody(bodyPart);
  }
  const text = Buffer.from(payload.body.data ?? '', 'base64url').toString('utf8');
  if (payload.mimeType === 'text/html') {
    return withoutTags(text);
  }
  return withoutSignature(withoutQuotedReply(text)).slice(0, maximumBodyLength);
}

function withoutSignature(text: string): string {
  return text.replace(/\n-- \n[\s\S]*$/, '');
}

function withoutQuotedReply(text: string): string {
  return text.replace(/\n\nOn .* wrote:\n(?:>.*\n)+/, '\n');
}

function withoutTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
