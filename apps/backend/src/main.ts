import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';

import { createApp, currentTriagePromptVersion } from './app';
import { createClaudeAgent } from './claude-agent';
import { createClaudeFilter } from './claude-filter';
import { createMessageWith } from './claude-message';
import { createClaudePrioritization } from './claude-prioritization';
import { createClaudeSummary } from './claude-summary';
import { createClaudeTriage, type ClaudePricing } from './claude-triage';
import { createEscalatingTriage } from './escalating-triage';
import { readStartupSettings } from './startup-settings';

// The shipped composition: settings from the environment (MY_LIFE_*), the SQLite store under Application Support,
// the built dashboard at /, and Claude behind the Triage port. Localhost only (CLAUDE.md locked decision 19): the
// extension and the dashboard are the only clients.
const settings = readStartupSettings(process.env, homedir());
const promptPath = fileURLToPath(new URL(`../prompts/${currentTriagePromptVersion}.md`, import.meta.url));
const filterPromptPath = fileURLToPath(new URL('../prompts/filter-v1.md', import.meta.url));
const digestSummaryPromptPath = fileURLToPath(new URL('../prompts/digest-summary-v1.md', import.meta.url));
const prioritizationPromptPath = fileURLToPath(new URL('../prompts/prioritization-v1.md', import.meta.url));
const agentPromptPath = fileURLToPath(new URL('../prompts/agent-v1.md', import.meta.url));
const profileDirectory =
  process.env.MY_LIFE_PROFILE_DIRECTORY ?? fileURLToPath(new URL('../../../profile', import.meta.url));
const triageRunIntervalInMilliseconds = 30_000;

// Anthropic list prices per million tokens (2026-11-07). The model id is config; a model missing here stops the backend
// at startup instead of logging a wrong spend.
const pricingByModel: Record<string, ClaudePricing> = {
  'claude-opus-5-5': { inputPerMillionTokensInUsd: 4, outputPerMillionTokensInUsd: 20 },
  'claude-sonnet-5-5': { inputPerMillionTokensInUsd: 2, outputPerMillionTokensInUsd: 10 },
  'claude-haiku-5-5': { inputPerMillionTokensInUsd: 0.1, outputPerMillionTokensInUsd: 0.5 },
};

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
        promptPath: digestSummaryPromptPath,
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

const prioritization =
  claude === undefined
    ? undefined
    : createClaudePrioritization({
        model: settings.prioritizationModel,
        promptPath: prioritizationPromptPath,
        pricing: pricingFor(settings.prioritizationModel),
        createMessage: (request) =>
          claude.createMessage({
            model: request.model,
            system: request.system,
            messages: request.messages,
            tools: request.tools.map((tool) => ({ ...tool, strict: true })),
          }),
      });

const agent =
  claude === undefined
    ? undefined
    : createClaudeAgent({
        model: settings.agentModel,
        promptPath: agentPromptPath,
        profileDirectory,
        pricing: pricingFor(settings.agentModel),
        createMessage: (request) =>
          claude.createMessage({
            model: request.model,
            system: request.system,
            messages: request.messages,
            tools: request.tools.map(({ name, description, input_schema }) => ({
              name,
              description,
              strict: false,
              input_schema,
            })),
          }),
      });

const app = createApp({
  allowedEmails: settings.allowedEmails,
  databasePath: settings.databasePath,
  dashboardDirectory: settings.dashboardDirectory,
  gmailPollingIntervalInMilliseconds: settings.gmailPollingIntervalInMilliseconds,
  dailySpendCeilingInUsd: settings.dailySpendCeilingInUsd,
  urgency: settings.urgency,
  profileDirectory,
  ...(triage === undefined ? {} : { triage }),
  ...(filter === undefined ? {} : { filter }),
  ...(summary === undefined ? {} : { summary }),
  ...(prioritization === undefined ? {} : { prioritization }),
  ...(agent === undefined ? {} : { agent }),
});

function runTriage(): void {
  Promise.resolve(app.request('/triage-run', { method: 'POST' })).catch((error: unknown) => {
    console.error('triage run failed', error);
  });
}

function runPrioritization(): void {
  Promise.resolve(app.request('/prioritization-run', { method: 'POST' })).catch((error: unknown) => {
    console.error('prioritization run failed', error);
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
    runPrioritization();
    setInterval(runTriage, triageRunIntervalInMilliseconds);
  }
});
