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
});
