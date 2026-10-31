import type { Entity } from '@backstage/catalog-model';
import { CAP, capabilitiesOf } from './serviceClass';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import type { TowerAgentState, TowerFleetSummary, TowerPrMark, TowerRunMark } from './mounts';

// What Tower does with the fleet summary and the receipts a mount provides (mounts.tsx): which agent a Component is,
// which agents may act on an app, and which PR or build an agent made. Pure, so the Services list, the Pull requests,
// Pipelines and Releases tabs share one reading of the data.

/** A Component whose agent definition has another name says so; the Autopilot plugin reads the same annotation. */
export const AGENT_ANNOTATION = 'autopilot.hangar.io/agent';

export function agentNameOf(entity: Entity): string {
  return entity.metadata.annotations?.[AGENT_ANNOTATION]?.trim() || entity.metadata.name;
}

/** The app name an agent's scope would use: the repo's name without a gitops-/gitops-infra- prefix, else the catalog name. */
export function appNameOf(entity: Entity): string {
  const repo = entity.metadata.annotations?.['github.com/project-slug']?.split('/')[1];
  return (repo ?? entity.metadata.name).replace(/^gitops-(infra-)?/, '').toLowerCase();
}

export const isAgentEntity = (entity: Entity): boolean => capabilitiesOf(entity).has(CAP.autopilot);

export interface FleetIndex {
  byName: Map<string, TowerAgentState>;
  /** The agents whose scope names this app. */
  actingOn: (app: string) => TowerAgentState[];
  newAgentHref?: string;
}

export function indexFleet(fleet: TowerFleetSummary | undefined): FleetIndex {
  const agents = fleet?.agents ?? [];
  const byName = new Map(agents.map(a => [a.name, a]));
  const byApp = new Map<string, TowerAgentState[]>();
  for (const a of agents) {
    for (const app of a.actsOn) {
      const key = app.toLowerCase();
      byApp.set(key, [...(byApp.get(key) ?? []), a]);
    }
  }
  return { byName, actingOn: app => byApp.get(app.toLowerCase()) ?? [], newAgentHref: fleet?.newAgentHref };
}

/** The agent behind an AI workload or AI service Component, if the fleet knows it. */
export function agentStateOf(index: FleetIndex, entity: Entity): TowerAgentState | undefined {
  return isAgentEntity(entity) ? index.byName.get(agentNameOf(entity)) : undefined;
}

/** Search also matches the apps an agent may act on: "gate" finds triage-agent (scope gate-api). */
export function agentMatchesQuery(state: TowerAgentState | undefined, q: string): boolean {
  return Boolean(state && q && state.actsOn.some(app => app.toLowerCase().includes(q)));
}

/** `https://github.com/owner/name/pull/12` -> `owner/name`. */
export function repoSlugOfUrl(url: string | undefined): string | undefined {
  const m = url?.match(/github\.com\/([^/]+\/[^/#?]+)/i);
  return m ? m[1].replace(/\.git$/, '').toLowerCase() : undefined;
}

export function markForPr(marks: TowerPrMark[], pr: Pick<PullRequestSummary, 'number' | 'url'>): TowerPrMark | undefined {
  const repo = repoSlugOfUrl(pr.url);
  return repo ? marks.find(m => m.repo === repo && m.pr === pr.number) : undefined;
}

/** The agent an event started for this run (by the run's name, the event's subject); a live one first. */
export function runMarkFor(marks: TowerRunMark[], runName: string | undefined): TowerRunMark | undefined {
  if (!runName) return undefined;
  const mine = marks.filter(m => m.pipelineRun === runName);
  return mine.find(m => m.state === 'live') ?? mine[0];
}

/** The receipt whose branch a build ran on (a PR's own preview build), by repo when the run knows its source repo. */
export function markForBranch(marks: TowerPrMark[], branch: string | undefined, sourceRepoUrl?: string): TowerPrMark | undefined {
  if (!branch) return undefined;
  const repo = repoSlugOfUrl(sourceRepoUrl);
  return marks.find(m => m.branch === branch && (!repo || m.repo === repo));
}
