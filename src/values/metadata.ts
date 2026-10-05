// Extra labels and annotations the airframe-application chart lets a values file set on the Rollout, the pod template and the
// Service (rollout.labels/annotations, podLabels/podAnnotations, serviceLabels/serviceAnnotations; chart v0.3.115+). The chart
// fails the render when a key would override something it owns; the same rules are checked here so the problem shows before a
// pull request is opened rather than as a Degraded Application afterwards.

export interface KeyValueRow {
  key: string;
  value: string;
}

export type MetadataField = 'labels' | 'annotations' | 'podLabels' | 'podAnnotations' | 'serviceLabels' | 'serviceAnnotations';

export const METADATA_FIELDS: Array<{ field: MetadataField; title: string; noun: 'label' | 'annotation'; hint: string }> = [
  { field: 'podAnnotations', title: 'Pod annotations', noun: 'annotation', hint: 'On every pod: Prometheus scrape hints, Vault or Reloader settings. Changing one rolls the pods.' },
  { field: 'podLabels', title: 'Pod labels', noun: 'label', hint: 'On every pod, for example cost allocation or team. The selector labels cannot be changed.' },
  { field: 'annotations', title: 'Rollout annotations', noun: 'annotation', hint: 'On the Rollout object itself, not its pods.' },
  { field: 'labels', title: 'Rollout labels', noun: 'label', hint: 'On the Rollout object itself, not its pods.' },
  { field: 'serviceAnnotations', title: 'Service annotations', noun: 'annotation', hint: 'On the Service (and the preview Service for blueGreen), for example a load balancer setting.' },
  { field: 'serviceLabels', title: 'Service labels', noun: 'label', hint: 'On the Service (and the preview Service for blueGreen).' },
];

const isLabelField = (f: MetadataField) => f === 'labels' || f === 'podLabels' || f === 'serviceLabels';

/** Why this key cannot be used for this field, or undefined when it can. */
export function reservedKeyProblem(field: MetadataField, key: string): string | undefined {
  if (isLabelField(field)) {
    if (key.startsWith('app.kubernetes.io/') || key.startsWith('hangar.io/') || key === 'helm.sh/chart') {
      return `"${key}" is a label the chart owns (app.kubernetes.io/*, hangar.io/* and helm.sh/chart are reserved).`;
    }
    return undefined;
  }
  if (key.startsWith('checksum/')) return `"${key}" is a chart-owned annotation (checksum/* rolls the pods when a ConfigMap or Secret entry changes).`;
  return undefined;
}

/** Problems with a field's rows, worded for the pending-changes panel. */
export function metadataProblems(field: MetadataField, title: string, rows: KeyValueRow[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const key = r.key.trim();
    if (!key) {
      if (r.value.trim()) out.push(`${title}: a value has no key.`);
      continue;
    }
    const reserved = reservedKeyProblem(field, key);
    if (reserved) out.push(`${title}: ${reserved}`);
    if (seen.has(key)) out.push(`${title}: "${key}" is listed twice.`);
    seen.add(key);
  }
  return out;
}

export const emptyMetadata = (): Record<MetadataField, KeyValueRow[]> => ({
  labels: [],
  annotations: [],
  podLabels: [],
  podAnnotations: [],
  serviceLabels: [],
  serviceAnnotations: [],
});
