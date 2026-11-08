import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';

import { createApp, currentTriagePromptVersion } from './app';
import { createClaudeFilter } from './claude-filter';
import { createClaudeSummary } from './claude-summary';
import { createClaudeTriage, type ClaudePricing, type ClaudeRequest } from './claude-triage';
import { createEscalatingTriage } from './escalating-triage';
import { readStartupSettings } from './startup-settings';

// The shipped composition: settings from the environment (MY_LIFE_*), the SQLite store under Application Support,
// the built dashboard at /, and Claude behind the Triage port. Localhost only (CLAUDE.md locked decision 19): the
// extension and the dashboard are the only clients.
const settings = readStartupSettings(process.env, homedir());
const promptPath = fileURLToPath(new URL(`../prompts/${currentTriagePromptVersion}.md`, import.meta.url));
const filterPromptPath = fileURLToPath(new URL('../prompts/filter-v1.md', import.meta.url));
const profileDirectory = fileURLToPath(new URL('../../../profile', import.meta.url));
const triageRunIntervalInMilliseconds = 30_000;
const maximumAnswerTokens = 2048;

// Anthropic list prices per million tokens (2026-11-07). The model id is config; a model missing here disables triage
// loudly instead of logging a wrong spend.
const pricingByModel: Record<string, ClaudePricing> = {
  'claude-opus-5-5': { inputPerMillionTokensInUsd: 4, outputPerMillionTokensInUsd: 20 },
  'claude-sonnet-5-5': { inputPerMillionTokensInUsd: 2, outputPerMillionTokensInUsd: 10 },
  'claude-haiku-5-5': { inputPerMillionTokensInUsd: 0.1, outputPerMillionTokensInUsd: 0.5 },
};

// One Anthropic call shape for both adapters: a system prompt, user messages, strict tools, low effort, fallbacks.
function createMessageWith(client: Anthropic) {
  return async (request: ClaudeRequest) => {
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
  };
}

function claudeSettings() {
  if (!settings.triage.enabled) {
    console.log(`triage disabled: ${settings.triage.reason}`);
    return undefined;
  }
  return { createMessage: createMessageWith(new Anthropic()) };
}

function pricingFor(model: string): ClaudePricing {
  const pricing = pricingByModel[model];
  if (pricing === undefined) throw new Error(`no pricing known for model ${model}; triage cannot start`);
  return pricing;
}

// Haiku (MY_LIFE_TRIAGE_MODEL) reads every message; Opus (MY_LIFE_TRIAGE_ESCALATION_MODEL) gives a second opinion
// only when the first says the message needs the user or cannot place it. User decision 2026-11-08, see
// docs/decisions/2026-11-08-triage-model-comparison.md. Filter proposals stay on the stronger model.
const claude = claudeSettings();
const strongestModel = settings.triageEscalationModel ?? settings.triageModel;
function createTriage(createMessage: NonNullable<typeof claude>['createMessage']) {
  const triageFor = (model: string) =>
    createClaudeTriage({ model, promptPath, profileDirectory, pricing: pricingFor(model), createMessage });
  const first = triageFor(settings.triageModel);
  const escalation = settings.triageEscalationModel;
  return escalation === undefined ? first : createEscalatingTriage({ first, second: triageFor(escalation) });
}
const triage = claude === undefined ? undefined : createTriage(claude.createMessage);
const filter =
  claude === undefined
    ? undefined
    : createClaudeFilter({
        model: strongestModel,
        promptPath: filterPromptPath,
        pricing: pricingFor(strongestModel),
        createMessage: claude.createMessage,
      });

// The digest summary's tool input: one or two lines of text, checked again by the adapter.
const summaryToolInputSchema = {
  type: 'object',
  properties: { lines: { type: 'array', items: { type: 'string' } } },
  required: ['lines'],
  additionalProperties: false,
};
const summary =
  claude === undefined
    ? undefined
    : createClaudeSummary({
        model: settings.summaryModel,
        pricing: pricingFor(settings.summaryModel),
        createMessage: (request) =>
          claude.createMessage({
            model: request.model,
            system: request.system ?? '',
            messages: request.messages,
            tools: request.tools.map(({ name }) => ({
              name,
              strict: true,
              input_schema: summaryToolInputSchema,
            })),
          }),
      });

const app = createApp({
  allowedEmails: settings.allowedEmails,
  databasePath: settings.databasePath,
  dashboardDirectory: settings.dashboardDirectory,
  gmailPollingIntervalInMilliseconds: settings.gmailPollingIntervalInMilliseconds,
  dailySpendCeilingInUsd: settings.dailySpendCeilingInUsd,
  ...(triage === undefined ? {} : { triage }),
  ...(filter === undefined ? {} : { filter }),
  ...(summary === undefined ? {} : { summary }),
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
        : ` · triage with ${settings.triageModel}${settings.triageEscalationModel === undefined ? '' : `, second opinion from ${settings.triageEscalationModel}`}, filter proposals with ${strongestModel}, ceiling USD ${String(settings.dailySpendCeilingInUsd)}/day`),
  );
  if (triage !== undefined) {
    runTriage();
    setInterval(runTriage, triageRunIntervalInMilliseconds);
  }
});
