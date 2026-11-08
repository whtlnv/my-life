import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';

import { createClaudeTriage, type ClaudePricing } from '../src/claude-triage';

// Re-triages the messages the production store already holds with several models, from headers only (the store
// keeps no snippet), and prints how often each model agrees with the others and with the stored proposals.
// Usage: MODELS=claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5 tsx scripts/compare-triage-models.ts [limit]

const databasePath = join(homedir(), 'Library', 'Application Support', 'my-life', 'my-life.sqlite');
const promptPath = fileURLToPath(new URL('../prompts/triage-v1.md', import.meta.url));
const profileDirectory = fileURLToPath(new URL('../../../profile', import.meta.url));
const models = (process.env.MODELS ?? 'claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5').split(',');
const limit = Number(process.argv[2] ?? '1000');
const pricingByModel: Record<string, ClaudePricing> = {
  'claude-opus-5-5': { inputPerMillionTokensInUsd: 4, outputPerMillionTokensInUsd: 20 },
  'claude-sonnet-5-5': { inputPerMillionTokensInUsd: 2, outputPerMillionTokensInUsd: 10 },
  'claude-haiku-5-5': { inputPerMillionTokensInUsd: 0.1, outputPerMillionTokensInUsd: 0.5 },
};

interface Row {
  id: string;
  accountEmail: string;
  from: string;
  listId: string | null;
  to: string;
  cc: string | null;
  subject: string;
  date: string;
  proposal: string;
}

const database = new Database(databasePath, { readonly: true });
const rows = database
  .prepare<[], Row>(
    `SELECT m.message_id AS id, m.account_email AS accountEmail, s.from_header AS "from", s.list_id AS listId,
            r.to_header AS "to", r.cc_header AS cc, j.subject AS subject, d.date_header AS date,
            (SELECT proposal FROM proposals p WHERE p.message_id = m.message_id ORDER BY rowid DESC LIMIT 1) AS proposal
     FROM reported_messages m
     JOIN reported_message_senders s ON s.message_id = m.message_id
     JOIN reported_message_recipients r ON r.message_id = m.message_id
     JOIN reported_message_subjects j ON j.message_id = m.message_id
     JOIN reported_message_dates d ON d.message_id = m.message_id
     ORDER BY m.rowid`,
  )
  .all()
  .slice(0, limit);

const client = new Anthropic();
const createMessage = async (request: {
  model: string;
  system: string;
  messages: { role: string; content: string }[];
  tools: { name: string; strict: boolean; input_schema: unknown }[];
}) => {
  const response = await client.beta.messages.create({
    model: request.model,
    max_tokens: 2048,
    system: request.system,
    messages: request.messages.map((message) => ({ role: 'user' as const, content: message.content })),
    tools: request.tools.map((tool) => ({
      name: tool.name,
      strict: tool.strict,
      input_schema: tool.input_schema as Anthropic.Beta.BetaTool['input_schema'],
    })),
    output_config: { effort: 'low' },
  });
  return {
    content: response.content.map((block) =>
      block.type === 'tool_use' ? { type: block.type, input: block.input } : { type: block.type },
    ),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
};

interface Answer {
  category: string;
  action: string;
  summary: string;
  costInUsd: number;
}

const results: Record<string, Record<string, Answer>> = {};
for (const model of models) {
  const pricing = pricingByModel[model];
  if (pricing === undefined) throw new Error(`no pricing for ${model}`);
  const triage = createClaudeTriage({ model, promptPath, profileDirectory, pricing, createMessage });
  const answers: Record<string, Answer> = {};
  results[model] = answers;
  let spent = 0;
  const batches: Row[][] = [];
  for (let index = 0; index < rows.length; index += 5) batches.push(rows.slice(index, index + 5));
  for (const batch of batches) {
    await Promise.all(
      batch.map(async (row) => {
        const outcome = await triage.propose({
          id: row.id,
          date: row.date,
          accountEmail: row.accountEmail,
          from: row.from,
          to: row.to,
          ...(row.cc === null ? {} : { cc: row.cc }),
          subject: row.subject,
          ...(row.listId === null ? {} : { listId: row.listId }),
        });
        const proposal = outcome.proposal as { category?: string; action?: string; summary?: string } | undefined;
        answers[row.id] = {
          category: proposal?.category ?? 'FAILED',
          action: proposal?.action ?? 'FAILED',
          summary: proposal?.summary ?? '',
          costInUsd: outcome.costInUsd,
        };
        spent += outcome.costInUsd;
      }),
    );
  }
  console.log(`${model}: ${String(rows.length)} messages, USD ${spent.toFixed(3)}`);
}

const stored: Record<string, Answer> = {};
for (const row of rows) {
  const proposal = JSON.parse(row.proposal) as { category: string; action: string; summary: string };
  stored[row.id] = { ...proposal, costInUsd: 0 };
}

const agreement = (left: Record<string, Answer>, right: Record<string, Answer>) => {
  let category = 0;
  let action = 0;
  for (const row of rows) {
    if (left[row.id]?.category === right[row.id]?.category) category += 1;
    if (left[row.id]?.action === right[row.id]?.action) action += 1;
  }
  const total = rows.length;
  return `category ${String(category)}/${String(total)} · action ${String(action)}/${String(total)}`;
};

console.log('\nAgreement with the stored Opus proposals (which had the snippet):');
for (const model of models) console.log(`  ${model}: ${agreement(results[model] ?? {}, stored)}`);
console.log('\nAgreement between models (headers only, same input):');
for (const [index, left] of models.entries()) {
  for (const right of models.slice(index + 1)) {
    console.log(`  ${left} vs ${right}: ${agreement(results[left] ?? {}, results[right] ?? {})}`);
  }
}

const out = join(process.env.OUT_DIR ?? '.', 'triage-model-comparison.json');
writeFileSync(out, JSON.stringify({ rows, stored, results }, null, 2));
console.log(`\nDetails written to ${out}`);
