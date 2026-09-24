import type { HangarTokens } from '../../../brand/tokens';
import { envStageRank, health, type EnvironmentSummary, type Health } from '../../types';
import type { FleetApp } from '../../useFleetEnvironments';

// Fleet Grid / Ops Wall's per-environment cell status: Health plus one
// fleet-only case - an app that simply has no environment by this column's
// name at all. Env columns are the UNION of environment names seen across
// the whole fleet (see fleetEnvColumns in ../../useFleetEnvironments.tsx),
// not any one app's own real cicd.yaml promotionOrder - that ordering is
// GitHub-backed (usePipelineOrder(repoRef)) and deliberately not fetched
// fleet-wide, see useFleetEnvironments.tsx's own comment on why.
export type TileStatus = Health | 'none';

export function healthColor(t: HangarTokens, status: TileStatus): string {
  switch (status) {
    case 'healthy':
      return t.good;
    case 'progressing':
      return t.sky;
    case 'paused':
      return t.amber;
    case 'degraded':
      return t.bad;
    case 'none':
      return t.line;
    case 'unknown':
    default:
      return t.textFaint;
  }
}

export function healthLabel(status: TileStatus): string {
  switch (status) {
    case 'healthy':
      return 'healthy';
    case 'progressing':
      return 'in progress';
    case 'paused':
      return 'paused';
    case 'degraded':
      return 'degraded';
    case 'none':
      return 'not deployed';
    case 'unknown':
    default:
      return 'unknown';
  }
}

// Worse-wins severity, same posture as types.ts's own HEALTH_SEVERITY (see
// health()'s comment) - used to pick the one status a tile's summary line
// leads with when an app has several environments. 'none' is ranked BELOW
// 'healthy' (not tied with it) - a real bug caught live 2026-09-13: with
// 'none' tied at severity 0, worstStatus's reduce (seeded at 'healthy')
// could never move off that seed for an all-'none' input (0 > 0 is false),
// so an app with zero fleet-visible environments rendered a green "healthy"
// dot instead of the intended gray "not yet deployed" one. Seeding the
// reduce at 'none' itself (the true floor) instead of a hardcoded 'healthy'
// fixes both that case and the mirror bug it also had - a single real
// 'healthy' status losing to an earlier 'none' in the same list purely
// because of ordering, since ties silently kept whichever came first.
const STATUS_SEVERITY: Record<TileStatus, number> = {
  none: -1,
  healthy: 0,
  unknown: 1,
  paused: 2,
  progressing: 3,
  degraded: 4,
};

export function worstStatus(statuses: TileStatus[]): TileStatus {
  return statuses.reduce((worst, s) => (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst] ? s : worst), 'none' as TileStatus);
}

export function tileStatus(app: FleetApp, envName: string): TileStatus {
  const env = app.environments.find(e => e.env === envName);
  return env ? health(env) : 'none';
}

// "Latest" = the furthest-progressed real environment this app is deployed
// to, using the same generic fallback rank fleetEnvColumns uses fleet-wide -
// see that function's own comment (useFleetEnvironments.tsx) on why the real
// per-app promotionOrder isn't available here.
export function latestEnv(app: FleetApp): EnvironmentSummary | undefined {
  return [...app.environments].sort((a, b) => envStageRank(b.env) - envStageRank(a.env))[0];
}
