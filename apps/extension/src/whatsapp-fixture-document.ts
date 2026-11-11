import { readFileSync } from 'node:fs';

// A saved WhatsApp Web page from this folder, parsed as the content script would see it.
export const fixtureDocument = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(new URL(fileName, import.meta.url), 'utf8'), 'text/html');
