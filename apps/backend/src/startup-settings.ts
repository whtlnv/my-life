import { fileURLToPath } from 'node:url';

import type { UrgencySettings } from '@my-life/domain';

import { resolveDatabasePath } from './database-path';

export type TriageAvailability = { enabled: false; reason: string } | { enabled: true };

export interface StartupSettings {
  allowedEmails: string[];
  databasePath: string;
  dashboardDirectory: string;
  port: number;
  gmailPollingIntervalInMilliseconds: number;
  triageModel: string;
  // The model asked when the first one says `action` or `unknown`; undefined runs one model for everything.
  triageEscalationModel?: string;
  summaryModel: string;
  prioritizationModel: string;
  agentModel: string;
  dailySpendCeilingInUsd: number;
  triage: TriageAvailability;
  urgency: UrgencySettings;
  slackWorkspaces: SlackWorkspaceSettings[];
  slackPollingIntervalInMilliseconds: number;
  slackApiUrl: string;
}

export interface SlackWorkspaceSettings {
  teamId: string | undefined;
  userToken: string | undefined;
}

const defaultPort = 7777;
const millisecondsPerSecond = 1000;
const defaultGmailPollingIntervalInSeconds = 60;
export const defaultGmailPollingIntervalInMilliseconds = secondsToMilliseconds(defaultGmailPollingIntervalInSeconds);
const defaultSlackPollingIntervalInSeconds = 60;
const defaultTriageModel = 'claude-haiku-5-5';
const defaultTriageEscalationModel = 'claude-opus-5-5';
const defaultSummaryModel = 'claude-haiku-5-5';
const defaultPrioritizationModel = 'claude-opus-5-5';
const defaultAgentModel = 'claude-opus-5-5';
const noEscalation = 'none';
const defaultDailySpendCeilingInUsd = 20;
export const defaultUnansweredAskBusinessDays = 2;
export const businessTimeZone = 'America/Mexico_City';
export const defaultDeadlineHours = 48;
export const defaultVipWaitingBusinessDays = 1;
const defaultDashboardDirectory = fileURLToPath(new URL('../../dashboard/dist', import.meta.url));

export function readStartupSettings(
  environment: Record<string, string | undefined>,
  homeDirectory: string,
): StartupSettings {
  return {
    allowedEmails: parseAllowedEmails(environment.MY_LIFE_ALLOWED_EMAILS),
    port: parseNumberOrDefault(environment.MY_LIFE_PORT, defaultPort),
    databasePath: resolveDatabasePath(environment.MY_LIFE_DATABASE_PATH, homeDirectory),
    dashboardDirectory: environment.MY_LIFE_DASHBOARD_DIRECTORY ?? defaultDashboardDirectory,
    gmailPollingIntervalInMilliseconds: secondsToMilliseconds(
      parseNumberOrDefault(environment.MY_LIFE_GMAIL_POLLING_INTERVAL_SECONDS, defaultGmailPollingIntervalInSeconds),
    ),
    triageModel: environment.MY_LIFE_TRIAGE_MODEL ?? defaultTriageModel,
    ...readTriageEscalationModel(environment.MY_LIFE_TRIAGE_ESCALATION_MODEL),
    summaryModel: environment.MY_LIFE_SUMMARY_MODEL ?? defaultSummaryModel,
    prioritizationModel: environment.MY_LIFE_PRIORITIZATION_MODEL ?? defaultPrioritizationModel,
    agentModel: environment.MY_LIFE_AGENT_MODEL ?? defaultAgentModel,
    dailySpendCeilingInUsd: parseNumberOrDefault(
      environment.MY_LIFE_DAILY_SPEND_CEILING_USD,
      defaultDailySpendCeilingInUsd,
    ),
    triage: readTriageAvailability(environment.ANTHROPIC_API_KEY),
    urgency: {
      timeZone: businessTimeZone,
      unansweredAskBusinessDays: parseNumberOrDefault(
        environment.MY_LIFE_UNANSWERED_ASK_BUSINESS_DAYS,
        defaultUnansweredAskBusinessDays,
      ),
      deadlineHours: defaultDeadlineHours,
      vipWaitingBusinessDays: defaultVipWaitingBusinessDays,
    },
    slackWorkspaces: readSlackWorkspaces(environment),
    slackPollingIntervalInMilliseconds: secondsToMilliseconds(
      parseNumberOrDefault(environment.MY_LIFE_SLACK_POLLING_INTERVAL_SECONDS, defaultSlackPollingIntervalInSeconds),
    ),
    slackApiUrl: 'https://slack.com/api',
  };
}

function readSlackWorkspaces(environment: Record<string, string | undefined>): SlackWorkspaceSettings[] {
  return [readSlackWorkspace(environment, 1), readSlackWorkspace(environment, 2)].filter(
    (workspace) => workspace.userToken !== undefined,
  );
}

function readSlackWorkspace(
  environment: Record<string, string | undefined>,
  workspaceNumber: number,
): SlackWorkspaceSettings {
  return {
    teamId: environment[`MY_LIFE_SLACK_WORKSPACE_${workspaceNumber}_TEAM_ID`],
    userToken: environment[`MY_LIFE_SLACK_WORKSPACE_${workspaceNumber}_USER_TOKEN`],
  };
}

function readTriageEscalationModel(configured: string | undefined): { triageEscalationModel?: string } {
  const model = configured ?? defaultTriageEscalationModel;
  return model === noEscalation ? {} : { triageEscalationModel: model };
}

function readTriageAvailability(anthropicApiKey: string | undefined): TriageAvailability {
  if (anthropicApiKey === undefined) {
    return { enabled: false, reason: 'ANTHROPIC_API_KEY is not set' };
  }
  return { enabled: true };
}

function secondsToMilliseconds(seconds: number): number {
  return seconds * millisecondsPerSecond;
}

function parseNumberOrDefault(numberText: string | undefined, defaultValue: number): number {
  if (numberText === undefined) {
    return defaultValue;
  }
  return Number(numberText);
}

function parseAllowedEmails(commaSeparatedEmails: string | undefined): string[] {
  if (commaSeparatedEmails === undefined || commaSeparatedEmails.trim() === '') {
    return [];
  }
  return commaSeparatedEmails.split(',').map((email) => email.trim());
}
