import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createClaudeTriage } from './claude-triage';
import { readStartupSettings } from './startup-settings';

interface SentRequest {
  model: string;
  system?: string;
  messages: { role: string; content: string }[];
}

function recordRequests() {
  const sentRequests: SentRequest[] = [];
  const createMessage = async (request: SentRequest) => {
    sentRequests.push(request);
    return { content: [], usage: { input_tokens: 0, output_tokens: 0 } };
  };
  return { sentRequests, createMessage };
}

describe('Claude triage', () => {
  it('sends a triage request with the model id from settings', async () => {
    const settings = readStartupSettings({ MY_LIFE_TRIAGE_MODEL: 'claude-model-from-settings' }, '/Users/ana');
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      model: settings.triageModel,
      createMessage,
    });

    await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z' });

    expect(sentRequests.map((request) => request.model)).toEqual(['claude-model-from-settings']);
  });

  it("sends the prompt read from the versioned prompt file and reports that file's version", async () => {
    const promptPath = join(mkdtempSync(join(tmpdir(), 'my-life-prompts-')), 'triage-v7.md');
    writeFileSync(promptPath, 'Classify this email for Ana.');
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      promptPath,
      createMessage,
    });

    const result = await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z' });

    expect({ system: sentRequests[0]?.system, promptVersion: result?.promptVersion }).toEqual({
      system: 'Classify this email for Ana.',
      promptVersion: 'triage-v7',
    });
  });

  it("sends the account's profile text read from the profile directory", async () => {
    const promptPath = join(mkdtempSync(join(tmpdir(), 'my-life-prompts-')), 'triage-v1.md');
    writeFileSync(promptPath, 'Classify this email.');
    const profileDirectory = mkdtempSync(join(tmpdir(), 'my-life-profile-'));
    writeFileSync(join(profileDirectory, 'acme.md'), 'Ana runs the Acme sales team; invoices always matter.');
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      promptPath,
      profileDirectory,
      createMessage,
    });

    await triage.propose({ id: 'message-1', date: '2026-11-07T10:00:00Z', accountEmail: 'ana@acme.com' });

    expect(sentRequests[0]?.system).toContain('Ana runs the Acme sales team; invoices always matter.');
  });

  it("sends the message's headers, snippet and whether it is addressed to the user", async () => {
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      createMessage,
    });

    await triage.propose({
      id: 'message-1',
      threadId: 'thread-1',
      accountEmail: 'ana@acme.com',
      from: 'Bruno <bruno@supplier.com>',
      to: 'Ana <Ana@acme.com>',
      cc: 'carla@acme.com',
      subject: 'Quote for November',
      date: '2026-11-07T10:00:00Z',
      snippet: 'Could you approve the attached quote by Friday?',
      listId: 'quotes.supplier.com',
    });

    expect(JSON.parse(sentRequests[0]?.messages?.[0]?.content ?? '{}')).toEqual({
      from: 'Bruno <bruno@supplier.com>',
      to: 'Ana <Ana@acme.com>',
      cc: 'carla@acme.com',
      subject: 'Quote for November',
      date: '2026-11-07T10:00:00Z',
      listId: 'quotes.supplier.com',
      snippet: 'Could you approve the attached quote by Friday?',
      addressedToUser: true,
    });
  });

  it('says a message is not addressed to the user when the account is only in Cc', async () => {
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      createMessage,
    });

    await triage.propose({
      id: 'message-2',
      accountEmail: 'ana@acme.com',
      from: 'Bruno <bruno@supplier.com>',
      to: 'Carla <carla@acme.com>',
      cc: 'Ana <ana@acme.com>',
      subject: 'Quote for November',
      date: '2026-11-07T10:00:00Z',
      snippet: 'Carla, could you approve the attached quote by Friday?',
    });

    expect(JSON.parse(sentRequests[0]?.messages?.[0]?.content ?? '{}')).toMatchObject({ addressedToUser: false });
  });

  it('sends the chosen verdict examples with the message', async () => {
    const { sentRequests, createMessage } = recordRequests();
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      createMessage,
    });
    const examples = [
      {
        messageId: 'message-0',
        from: 'Bruno <bruno@supplier.com>',
        category: 'expense',
        decision: 'confirmed',
        decidedAt: '2026-11-05T09:00:00-06:00',
      },
    ];

    await triage.propose(
      { id: 'message-3', accountEmail: 'ana@acme.com', from: 'Bruno <bruno@supplier.com>', date: '2026-11-07T10:00:00Z' },
      examples,
    );

    expect(JSON.parse(sentRequests[0]?.messages?.[0]?.content ?? '{}')).toMatchObject({ examples });
  });

  it('turns a valid tool-use answer into a proposal', async () => {
    const answeredProposal = {
      action: 'act',
      category: 'action',
      summary: 'Bruno asks Ana to approve the November quote.',
      extract: { asker: 'Bruno', ask: 'Approve the November quote' },
      reason: 'A supplier asks Ana directly for an approval.',
      taskDraft: { title: 'Approve the November quote from Bruno' },
    };
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      createMessage: async () => ({
        content: [{ type: 'tool_use', id: 'tool-use-1', name: 'propose_triage', input: answeredProposal }],
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    });

    const result = await triage.propose({ id: 'message-4', accountEmail: 'ana@acme.com', date: '2026-11-07T10:00:00Z' });

    expect(result).toMatchObject({ proposal: answeredProposal });
  });

  it('turns a tool-use answer that fails the shared contract into no proposal and records the failure', async () => {
    const answeredInput = {
      action: 'delete',
      category: 'action',
      summary: 'Bruno asks Ana to approve the November quote.',
      extract: { asker: 'Bruno', ask: 'Approve the November quote' },
      reason: 'A supplier asks Ana directly for an approval.',
    };
    const triage = createClaudeTriage({
      model: 'claude-opus-5-5',
      createMessage: async () => ({
        content: [{ type: 'tool_use', id: 'tool-use-1', name: 'propose_triage', input: answeredInput }],
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    });

    const result = await triage.propose({ id: 'message-5', accountEmail: 'ana@acme.com', date: '2026-11-07T10:00:00Z' });

    expect(result).toEqual({ failure: expect.objectContaining({ input: answeredInput }) });
  });
});
