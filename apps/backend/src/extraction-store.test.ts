import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { openExtractionStore } from './extraction-store';

const temporaryDatabasePath = () => join(mkdtempSync(join(tmpdir(), 'my-life-')), 'my-life.sqlite');

describe('extraction store', () => {
  it('still reads back the extraction of a message under its prompt version after it is reopened on the same database', () => {
    const databasePath = temporaryDatabasePath();
    const stored = {
      messageId: 'message-1',
      promptVersion: 'triage-v2',
      extractedAt: '2026-11-08T15:10:00.000Z',
      extraction: {
        people: [
          { name: 'Luis', email: 'luis@example.com', role: 'sender' },
          { name: 'Ana', email: 'ana@example.com', role: 'asked' },
        ],
        organization: 'example.com',
        asks: [{ ask: 'Review the budget', due: '2026-11-13' }],
        commitments: [{ who: 'Luis', commitment: 'Send the final sheet on Monday' }],
        dates: ['2026-11-13', '2026-11-16'],
        threadState: 'Luis is waiting for Ana to review the budget',
      },
    };
    openExtractionStore(databasePath).save(stored);

    const reopened = openExtractionStore(databasePath);

    expect(reopened.loadAll()).toEqual([stored]);
  });
});
