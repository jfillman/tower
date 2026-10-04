import type { CloudBlock, EnvDef } from '../../environments/stagedChanges';
import type { Health } from '../../types';

export interface DisplayRow {
  name: string;
  tier: 'ground' | 'flight';
  target: string;
  where: string;
  health: Health;
  deployed: boolean;
  image?: string;
  deployedAt?: string;
  def?: EnvDef;
  /** pr-open: its pull request is open and it does not exist yet. removal-pr: a pull request that removes it is open. */
  state?: 'new' | 'edited' | 'removed' | 'pr-open' | 'removal-pr';
}

// The fields of each cloud block an environment may override (glidepath schemas/cicd.schema.json).
export const BLOCK_FIELDS: Record<CloudBlock, string[]> = {
  lambda: ['functionName', 'region'],
  ecs: ['cluster', 'service', 'containerName', 'region', 'taskDefinitionFamily'],
  azureContainerApps: ['resourceGroup', 'appName'],
};
// The one field a new environment most often needs its own value for.
export const MAIN_FIELD: Record<CloudBlock, string> = { lambda: 'functionName', ecs: 'service', azureContainerApps: 'appName' };
export const TARGET_BLOCK: Record<string, CloudBlock> = {
  'aws-ecs': 'ecs',
  'aws-lambda': 'lambda',
  'azure-container-apps': 'azureContainerApps',
};

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
