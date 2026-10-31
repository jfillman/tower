import { capabilitiesOf, CAP } from './serviceClass.esm.js';

const AGENT_ANNOTATION = "autopilot.hangar.io/agent";
function agentNameOf(entity) {
  return entity.metadata.annotations?.[AGENT_ANNOTATION]?.trim() || entity.metadata.name;
}
function appNameOf(entity) {
  const repo = entity.metadata.annotations?.["github.com/project-slug"]?.split("/")[1];
  return (repo ?? entity.metadata.name).replace(/^gitops-(infra-)?/, "").toLowerCase();
}
const isAgentEntity = (entity) => capabilitiesOf(entity).has(CAP.autopilot);
function indexFleet(fleet) {
  const agents = fleet?.agents ?? [];
  const byName = new Map(agents.map((a) => [a.name, a]));
  const byApp = /* @__PURE__ */ new Map();
  for (const a of agents) {
    for (const app of a.actsOn) {
      const key = app.toLowerCase();
      byApp.set(key, [...byApp.get(key) ?? [], a]);
    }
  }
  return { byName, actingOn: (app) => byApp.get(app.toLowerCase()) ?? [], newAgentHref: fleet?.newAgentHref };
}
function agentStateOf(index, entity) {
  return isAgentEntity(entity) ? index.byName.get(agentNameOf(entity)) : void 0;
}
function agentMatchesQuery(state, q) {
  return Boolean(state && q && state.actsOn.some((app) => app.toLowerCase().includes(q)));
}
function repoSlugOfUrl(url) {
  const m = url?.match(/github\.com\/([^/]+\/[^/#?]+)/i);
  return m ? m[1].replace(/\.git$/, "").toLowerCase() : void 0;
}
function markForPr(marks, pr) {
  const repo = repoSlugOfUrl(pr.url);
  return repo ? marks.find((m) => m.repo === repo && m.pr === pr.number) : void 0;
}
function runMarkFor(marks, runName) {
  if (!runName) return void 0;
  const mine = marks.filter((m) => m.pipelineRun === runName);
  return mine.find((m) => m.state === "live") ?? mine[0];
}
function markForBranch(marks, branch, sourceRepoUrl) {
  if (!branch) return void 0;
  const repo = repoSlugOfUrl(sourceRepoUrl);
  return marks.find((m) => m.branch === branch && (!repo || m.repo === repo));
}

export { AGENT_ANNOTATION, agentMatchesQuery, agentNameOf, agentStateOf, appNameOf, indexFleet, isAgentEntity, markForBranch, markForPr, repoSlugOfUrl, runMarkFor };
//# sourceMappingURL=fleetMarks.esm.js.map
