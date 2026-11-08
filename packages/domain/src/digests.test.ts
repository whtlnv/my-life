import { describe, expect, it } from 'vitest';

import { digests } from './digests';

describe('digests', () => {
  it('places two system-update proposals from the same account naming the same system in one digest', () => {
    const firstAwsProposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'AWS', severity: 'info', significant: false },
    };
    const secondAwsProposal = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'AWS', severity: 'warning', significant: true },
    };
    const result = digests([firstAwsProposal, secondAwsProposal]);
    expect(result).toHaveLength(1);
    expect(result[0]?.proposals).toEqual([firstAwsProposal, secondAwsProposal]);
  });

  it('places two system-update proposals from the same account naming different systems in two digests', () => {
    const awsProposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'AWS', severity: 'info', significant: false },
    };
    const githubProposal = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'GitHub', severity: 'info', significant: false },
    };
    const result = digests([awsProposal, githubProposal]);
    expect(result.map((digest) => digest.proposals)).toEqual([[awsProposal], [githubProposal]]);
  });

  it('places two system-update proposals naming the same system from two different accounts in two digests', () => {
    const workAwsProposal = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'AWS', severity: 'info', significant: false },
    };
    const personalAwsProposal = {
      messageId: 'message-2',
      accountEmail: 'catala.francisco@gmail.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'AWS', severity: 'info', significant: false },
    };
    const result = digests([workAwsProposal, personalAwsProposal]);
    expect(result.map((digest) => digest.proposals)).toEqual([[workAwsProposal], [personalAwsProposal]]);
  });

  it('places two sales proposals from the same account and the same sender address in one digest keyed by that address', () => {
    const firstPitch = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'ana@acme.example',
      action: 'archive',
      category: 'sales',
      extract: { company: 'Acme', solution: 'CRM', problem: 'lost leads' },
    };
    const secondPitch = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'ana@acme.example',
      action: 'archive',
      category: 'sales',
      extract: { company: 'Acme', solution: 'CRM', problem: 'follow-up' },
    };
    const result = digests([firstPitch, secondPitch]);
    expect(result).toEqual([expect.objectContaining({ key: 'ana@acme.example', proposals: [firstPitch, secondPitch] })]);
  });

  it('places two sales proposals from the same account and different sender addresses in two digests even when they name the same company', () => {
    const anaPitch = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'ana@acme.example',
      action: 'archive',
      category: 'sales',
      extract: { company: 'Acme', solution: 'CRM', problem: 'lost leads' },
    };
    const brunoPitch = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'bruno@acme.example',
      action: 'archive',
      category: 'sales',
      extract: { company: 'Acme', solution: 'CRM', problem: 'lost leads' },
    };
    const result = digests([anaPitch, brunoPitch]);
    expect(result.map((digest) => digest.proposals)).toEqual([[anaPitch], [brunoPitch]]);
  });

  it('places two sales proposals whose From headers carry different display names for the same address in one digest', () => {
    const formalPitch = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'Ana Ruiz <ana@acme.example>',
      action: 'archive',
      category: 'sales',
      extract: { company: 'Acme', solution: 'CRM', problem: 'lost leads' },
    };
    const casualPitch = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      from: '"Ana from Acme" <ana@acme.example>',
      action: 'archive',
      category: 'sales',
      extract: { company: 'Acme', solution: 'CRM', problem: 'follow-up' },
    };
    const result = digests([formalPitch, casualPitch]);
    expect(result.map((digest) => digest.proposals)).toEqual([[formalPitch, casualPitch]]);
  });

  it('places two calendar-drive proposals from the same account and the same sender address in one digest keyed by that address', () => {
    const movedSync = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'calendar-notification@google.com',
      action: 'archive',
      category: 'calendar-drive',
      extract: { item: 'Weekly product sync', change: 'Moved from Wednesday 10:00 to Thursday 11:00' },
    };
    const acceptedReview = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'calendar-notification@google.com',
      action: 'archive',
      category: 'calendar-drive',
      extract: { item: 'Quarterly review', change: 'Ana accepted' },
    };
    const result = digests([movedSync, acceptedReview]);
    expect(result).toEqual([
      expect.objectContaining({ key: 'calendar-notification@google.com', proposals: [movedSync, acceptedReview] }),
    ]);
  });

  it('places two calendar-drive proposals from the same account and different sender addresses in two digests even when they name the same item', () => {
    const calendarChange = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'calendar-notification@google.com',
      action: 'archive',
      category: 'calendar-drive',
      extract: { item: 'Quarterly review', change: 'Moved from Wednesday 10:00 to Thursday 11:00' },
    };
    const driveShare = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'drive-shares-dm-noreply@google.com',
      action: 'archive',
      category: 'calendar-drive',
      extract: { item: 'Quarterly review', change: 'Ana shared the document' },
    };
    const result = digests([calendarChange, driveShare]);
    expect(result.map((digest) => digest.proposals)).toEqual([[calendarChange], [driveShare]]);
  });

  it('places no expense or cc-thread proposal in a digest', () => {
    const receipt = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'receipts@uber.example',
      action: 'archive',
      category: 'expense',
      extract: { vendor: 'Uber', amount: 182.5, currency: 'MXN', date: '2026-11-07' },
    };
    const copiedThread = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      from: 'ana@acme.example',
      action: 'archive',
      category: 'cc-thread',
      extract: { sinceLastMessage: 'Ana confirmed the delivery date' },
    };
    expect(digests([receipt, copiedThread])).toEqual([]);
  });

  it('reports how many of its proposals carry each severity', () => {
    const budgetAlert = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'keep',
      category: 'system-update',
      extract: { system: 'AWS', severity: 'high', significant: true },
    };
    const outageNotice = {
      messageId: 'message-2',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'keep',
      category: 'system-update',
      extract: { system: 'AWS', severity: 'high', significant: true },
    };
    const maintenanceNotice = {
      messageId: 'message-3',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'archive',
      category: 'system-update',
      extract: { system: 'AWS', severity: 'low', significant: false },
    };
    const result = digests([budgetAlert, outageNotice, maintenanceNotice]);
    expect(result[0]?.severityCounts).toEqual({ high: 2, low: 1 });
  });

  it('lists its significant items by name', () => {
    const budgetAlert = {
      messageId: 'message-1',
      accountEmail: 'franciscoc@psmutuus.com',
      action: 'keep',
      category: 'system-update',
      summary: 'Production budget at 85%',
      extract: { system: 'AWS', severity: 'high', significant: true },
    };
    const result = digests([budgetAlert]);
    expect(result[0]?.significantItems).toEqual([
      expect.objectContaining({ messageId: 'message-1', summary: 'Production budget at 85%' }),
    ]);
  });
});
