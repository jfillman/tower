import type { Entity } from '@backstage/catalog-model';
import { agentMatchesQuery, agentNameOf, agentStateOf, appNameOf, indexFleet, markForBranch, markForPr, repoSlugOfUrl, runMarkFor } from './fleetMarks';
import type { TowerAgentState, TowerPrMark, TowerRunMark } from './mounts';

const entity = (name: string, annotations?: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name, annotations },
  spec: { type: 'service' },
});
const agent = (name: string, over: Partial<TowerAgentState> = {}): TowerAgentState => ({ name, kind: 'event', actsOn: [], triggers: ['pipeline finished'], live: 0, tripped: 0, waiting: 0, ...over });
const triage = agent('triage-agent', { actsOn: ['gate-api'], live: 1, lastRun: { at: '2026-10-31T00:00:00Z', state: 'live', tripped: false } });
const reviewer = agent('nightly-reviewer', { kind: 'scheduled', actsOn: ['gate-api', 'boarding-api'], triggers: ['every 24h'] });

it('names the agent and the app the way the plugins do', () => {
  expect(agentNameOf(entity('triage-agent'))).toBe('triage-agent');
  expect(agentNameOf(entity('copilot-ui', { 'autopilot.hangar.io/agent': 'gate-copilot' }))).toBe('gate-copilot');
  expect(appNameOf(entity('gate-api', { 'github.com/project-slug': 'jfillman/gate-api' }))).toBe('gate-api');
  expect(appNameOf(entity('broker', { 'github.com/project-slug': 'jfillman/gitops-infra-skyport-broker' }))).toBe('skyport-broker');
  expect(appNameOf(entity('By-Hand'))).toBe('by-hand');
});

it('indexes the fleet by agent and by the apps they act on', () => {
  const index = indexFleet({ agents: [triage, reviewer], newAgentHref: '/autopilot?view=new' });
  expect(index.actingOn('gate-api').map(a => a.name)).toEqual(['triage-agent', 'nightly-reviewer']);
  expect(index.actingOn('Boarding-API').map(a => a.name)).toEqual(['nightly-reviewer']);
  expect(index.actingOn('flight-api')).toEqual([]);
  expect(index.newAgentHref).toBe('/autopilot?view=new');
  // Only an AI workload or AI service is an agent; an app named like one is not looked up.
  expect(agentStateOf(index, entity('triage-agent', { 'hangar.io/service-class': 'ai-workload' }))?.live).toBe(1);
  expect(agentStateOf(index, entity('triage-agent'))).toBeUndefined();
  expect(indexFleet(undefined).actingOn('gate-api')).toEqual([]);
});

it('search also matches the apps an agent may act on', () => {
  expect(agentMatchesQuery(triage, 'gate')).toBe(true);
  expect(agentMatchesQuery(triage, 'flight')).toBe(false);
  expect(agentMatchesQuery(triage, '')).toBe(false);
  expect(agentMatchesQuery(undefined, 'gate')).toBe(false);
});

it('finds the receipt behind a PR or a branch build', () => {
  const marks: TowerPrMark[] = [
    { repo: 'jfillman/gate-api', pr: 61, agent: 'triage-agent', branch: 'agent/t-9', at: '2026-10-31T00:00:00Z', verified: true },
    { repo: 'jfillman/gitops-gate-api', pr: 212, agent: 'release-proposer', at: '2026-10-31T00:10:00Z', verified: false },
  ];
  expect(repoSlugOfUrl('https://github.com/jfillman/gate-api/pull/61')).toBe('jfillman/gate-api');
  expect(repoSlugOfUrl('https://github.com/JFillman/Gate-API.git')).toBe('jfillman/gate-api');
  expect(repoSlugOfUrl(undefined)).toBeUndefined();
  expect(markForPr(marks, { number: 61, url: 'https://github.com/jfillman/gate-api/pull/61' })?.agent).toBe('triage-agent');
  expect(markForPr(marks, { number: 212, url: 'https://github.com/jfillman/gitops-gate-api/pull/212' })?.agent).toBe('release-proposer');
  expect(markForPr(marks, { number: 61, url: 'https://github.com/jfillman/other/pull/61' })).toBeUndefined();
  expect(markForBranch(marks, 'agent/t-9', 'https://github.com/jfillman/gate-api')?.pr).toBe(61);
  expect(markForBranch(marks, 'agent/t-9')?.pr).toBe(61);
  expect(markForBranch(marks, 'agent/t-9', 'https://github.com/jfillman/other')).toBeUndefined();
  expect(markForBranch(marks, undefined)).toBeUndefined();
});

it('finds the agent an event started for a run, preferring the live session', () => {
  const mark = (state: TowerRunMark['state'], agent = 'triage-agent'): TowerRunMark => ({ pipelineRun: 'gate-api-push-abc', agent, session: `s-${state}`, eventId: 'e', at: '2026-10-31T00:00:00Z', state, tripped: false });
  const marks = [mark('closed'), mark('live', 'other'), mark('expired')];
  expect(runMarkFor(marks, 'gate-api-push-abc')?.agent).toBe('other');
  expect(runMarkFor([mark('closed')], 'gate-api-push-abc')?.state).toBe('closed');
  expect(runMarkFor(marks, 'another-run')).toBeUndefined();
  expect(runMarkFor(marks, undefined)).toBeUndefined();
});
