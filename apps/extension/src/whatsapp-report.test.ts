// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { whatsappReport } from '@my-life/contracts';
import { describe, expect, it } from 'vitest';

import { buildWhatsappReport } from './whatsapp-report';

const fixtureDocument = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(new URL(fileName, import.meta.url), 'utf8'), 'text/html');

describe('buildWhatsappReport', () => {
  it('builds, from the saved one-to-one chat fixture, a report that passes the shared contract schema', () => {
    const report = buildWhatsappReport(fixtureDocument('whatsapp-one-to-one-chat.fixture.html'));

    expect(whatsappReport.safeParse(report).success).toBe(true);
  });
});
