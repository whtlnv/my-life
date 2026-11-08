export interface MessagePart {
  mimeType: string;
  filename?: string;
  body?: { size: number; data?: string };
  parts?: MessagePart[];
}

const maximumBodyBytes = 20 * 1024;

export function messageBody(payload: MessagePart): string {
  const bodyPart = chooseBodyPart(payload.parts ?? []);
  if (bodyPart) {
    return messageBody(bodyPart);
  }
  const decoded = decodeBase64Url(payload.body?.data ?? '');
  const text = payload.mimeType === 'text/html' ? htmlText(decoded) : decoded;
  return cappedToMaximumBodyBytes(withoutSignature(withoutQuotedReply(text)));
}

// Gmail encodes part data as base64url; atob and TextDecoder exist in both Node and a Chrome service worker, Buffer only in Node.
function decodeBase64Url(data: string): string {
  const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

const utf8Encoder = new TextEncoder();

function cappedToMaximumBodyBytes(text: string): string {
  let byteLength = 0;
  let capped = '';
  for (const character of text) {
    byteLength += utf8Encoder.encode(character).length;
    if (byteLength > maximumBodyBytes) {
      break;
    }
    capped += character;
  }
  return capped;
}

function chooseBodyPart(parts: MessagePart[]): MessagePart | undefined {
  return (
    parts.find((part) => part.mimeType === 'text/plain' && !part.filename) ??
    parts.find((part) => part.mimeType === 'text/html' && !part.filename) ??
    parts.find((part) => part.mimeType.startsWith('multipart/'))
  );
}

function withoutSignature(text: string): string {
  return text.replace(/\n-- \n[\s\S]*$/, '');
}

function withoutQuotedReply(text: string): string {
  return text.replace(/\n\nOn .* wrote:\n(?:>.*\n)+/, '\n');
}

function htmlText(html: string): string {
  return decodeEntities(withoutTags(withoutStylesAndScripts(html)));
}

function withoutStylesAndScripts(html: string): string {
  return html.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/g, '');
}

function withoutTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

const entities: Record<string, string> = {
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&amp;': '&',
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:nbsp|lt|gt|quot|#39|amp);/g, (entity) => entities[entity] ?? entity);
}
