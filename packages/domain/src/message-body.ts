interface MessagePart {
  body: { data: string };
}

export function messageBody(payload: MessagePart): string {
  return Buffer.from(payload.body.data, 'base64url').toString('utf8');
}
