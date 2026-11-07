import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { createClaudeTriage, type TriagePricing } from './claude-triage';
import { readStartupSettings } from './startup-settings';

// The shipped composition: settings from the environment (MY_LIFE_*), the SQLite store under Application Support,
// the built dashboard at /, and Claude behind the Triage port. Localhost only (CLAUDE.md locked decision 19): the
// extension and the dashboard are the only clients.
const settings = readStartupSettings(process.env, homedir());
const promptPath = fileURLToPath(new URL('../prompts/triage-v1.md', import.meta.url));
const profileDirectory = fileURLToPath(new URL('../../../profile', import.meta.url));
const triageRunIntervalInMilliseconds = 30_000;
const maximumAnswerTokens = 2048;

// Anthropic list prices per million tokens (2026-11-07). The model id is config; a model missing here disables triage
// loudly instead of logging a wrong spend.
const pricingByModel: Record<string, TriagePricing> = {
  'claude-opus-5-5': { inputPerMillionTokensInUsd: 4, outputPerMillionTokensInUsd: 20 },
  'claude-sonnet-5-5': { inputPerMillionTokensInUsd: 2, outputPerMillionTokensInUsd: 10 },
  'claude-haiku-5-5': { inputPerMillionTokensInUsd: 0.1, outputPerMillionTokensInUsd: 0.5 },
};

function createTriage() {
  if (!settings.triage.enabled) {
    console.log(`triage disabled: ${settings.triage.reason}`);
    return undefined;
  }
  const pricing = pricingByModel[settings.triageModel];
  if (pricing === undefined) {
    console.log(`triage disabled: no pricing known for model ${settings.triageModel}`);
    return undefined;
  }
  const client = new Anthropic();
  return createClaudeTriage({
    model: settings.triageModel,
    promptPath,
    profileDirectory,
    pricing,
    createMessage: async (request) => {
      const response = await client.beta.messages.create({
        model: request.model,
        max_tokens: maximumAnswerTokens,
        system: request.system,
        messages: request.messages.map((message) => ({ role: 'user' as const, content: message.content })),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          strict: tool.strict,
          input_schema: tool.input_schema as Anthropic.Beta.BetaTool['input_schema'],
        })),
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      return {
        content: response.content.map((block) =>
          block.type === 'tool_use' ? { type: block.type, input: block.input } : { type: block.type },
        ),
        usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
      };
    },
  });
}

const triage = createTriage();
const app = createApp({
  allowedEmails: settings.allowedEmails,
  databasePath: settings.databasePath,
  dashboardDirectory: settings.dashboardDirectory,
  gmailPollingIntervalInMilliseconds: settings.gmailPollingIntervalInMilliseconds,
  dailySpendCeilingInUsd: settings.dailySpendCeilingInUsd,
  ...(triage === undefined ? {} : { triage }),
});

function runTriage(): void {
  Promise.resolve(app.request('/triage-run', { method: 'POST' })).catch((error: unknown) => {
    console.error('triage run failed', error);
  });
}

serve({ fetch: app.fetch, port: settings.port, hostname: '127.0.0.1' }, (info) => {
  console.log(
    `my-life backend listening on http://127.0.0.1:${String(info.port)} · ${String(settings.allowedEmails.length)} allowed account(s) · store ${settings.databasePath}` +
      (triage === undefined
        ? ''
        : ` · triage with ${settings.triageModel}, ceiling USD ${String(settings.dailySpendCeilingInUsd)}/day`),
  );
  if (triage !== undefined) {
    runTriage();
    setInterval(runTriage, triageRunIntervalInMilliseconds);
  }
});
