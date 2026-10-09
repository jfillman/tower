import type { StatusTone } from './ui';

/**
 * ArgoCD's sync and health words on the same scale as Tower's own health (healthTone): in motion is blue, waiting on
 * someone or out of step is amber.
 */
export function argoTone(status: string | undefined): StatusTone {
  if (status === 'Healthy' || status === 'Synced') return 'ok';
  if (status === 'Progressing') return 'info';
  if (status === 'Suspended' || status === 'OutOfSync') return 'warn';
  if (status === 'Degraded' || status === 'Missing') return 'bad';
  return 'neutral';
}
