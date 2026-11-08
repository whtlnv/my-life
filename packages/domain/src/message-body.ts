interface MessagePart {
  mimeType: string;
  body: { data: string };
}

export function messageBody(payload: MessagePart): string {
  const text = Buffer.from(payload.body.data, 'base64url').toString('utf8');
  if (payload.mimeType === 'text/html') {
    return withoutTags(text);
  }
  return text;
}

function withoutTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
