import { envTierOf, health, imageTag, isPreviewEnvName, type EnvironmentSummary, type Health } from './types';

// One row of the Environments table. Built from what Tower already knows about each environment
// (useReleaseContext merges the declared environments, the live Kubernetes ones and the cloud ones
// derived from deploy runs), plus its tier from the app's own cicd.yaml.

export interface EnvironmentRow {
  name: string;
  /** Ground deploys on every push; flight only through an approved release. */
  tier: 'ground' | 'flight';
  /** "Kubernetes", "AWS Lambda", ... */
  target: string;
  /** The cluster for a Kubernetes environment; the function or service for a cloud one. */
  where: string;
  health: Health;
  /** Whether anything has been deployed there. */
  deployed: boolean;
  /** The live image tag, or undefined if nothing is deployed. */
  image?: string;
  deployedAt?: string;
}

export function buildEnvironmentRows(
  environments: EnvironmentSummary[],
  pipelineOrder?: { lower?: string[]; upper?: string[] },
): EnvironmentRow[] {
  return environments
    .filter(e => !isPreviewEnvName(e.env))
    .map(e => {
      const cloud = e.cloud;
      const where = cloud
        ? [cloud.resource?.name, cloud.resource?.region ?? cloud.resource?.scope].filter(Boolean).join(' · ') ||
          cloud.targetLabel
        : e.cluster || '—';
      return {
        name: e.env,
        tier: envTierOf(e.env, pipelineOrder) === 'upper' ? ('flight' as const) : ('ground' as const),
        target: cloud?.targetLabel ?? 'Kubernetes',
        where,
        health: health(e),
        deployed: e.deployed !== false && Boolean(e.image),
        image: e.image ? imageTag(e.image) : undefined,
        deployedAt: e.deployedAt,
      };
    });
}

interface DeployEnvironmentEntry {
  name?: unknown;
  tier?: unknown;
}

/**
 * The Ground environment names and the declared promotion order from a cicd.yaml `deploy:` block
 * (deploy.environments; list order is the order). Nothing declared means one Ground environment, dev, like
 * Glidepath. The pre-ADR-0019 fields were removed 2026-10-07 and are not read.
 */
export function envListsOf(deploy: Record<string, unknown>): { lower: string[]; order: string[] } {
  const declared = deploy.environments;
  if (Array.isArray(declared) && declared.length > 0) {
    const entries = (declared as DeployEnvironmentEntry[]).filter(e => typeof e?.name === 'string');
    return {
      lower: entries.filter(e => e.tier === 'ground').map(e => e.name as string),
      order: entries.map(e => e.name as string),
    };
  }
  return { lower: ['dev'], order: [] };
}
