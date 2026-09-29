// Standard cAdvisor/kube-state metrics queries kube-prometheus-stack scrapes
// on every cluster this platform runs (same Prometheus instance
// usePrometheusQuery.ts already targets for SLO burn rates and canary
// AnalysisRuns) - CPU/memory/network/disk-IO for a set of pods selected by
// name regex, scoped to one namespace. `container!="",container!="POD"`
// excludes the pause container cAdvisor otherwise double-counts alongside
// the real ones.

function podRegex(podNames: string[]): string {
  return podNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

export function cpuUsageQuery(namespace: string, podNames: string[]): string | undefined {
  if (podNames.length === 0) return undefined;
  return `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",pod=~"${podRegex(podNames)}",container!="",container!="POD"}[5m])) by (pod)`;
}

export function memoryUsageQuery(namespace: string, podNames: string[]): string | undefined {
  if (podNames.length === 0) return undefined;
  return `sum(container_memory_working_set_bytes{namespace="${namespace}",pod=~"${podRegex(podNames)}",container!="",container!="POD"}) by (pod)`;
}

export function networkRxQuery(namespace: string, podNames: string[]): string | undefined {
  if (podNames.length === 0) return undefined;
  return `sum(rate(container_network_receive_bytes_total{namespace="${namespace}",pod=~"${podRegex(podNames)}"}[5m])) by (pod)`;
}

export function networkTxQuery(namespace: string, podNames: string[]): string | undefined {
  if (podNames.length === 0) return undefined;
  return `sum(rate(container_network_transmit_bytes_total{namespace="${namespace}",pod=~"${podRegex(podNames)}"}[5m])) by (pod)`;
}

export function diskReadQuery(namespace: string, podNames: string[]): string | undefined {
  if (podNames.length === 0) return undefined;
  return `sum(rate(container_fs_reads_bytes_total{namespace="${namespace}",pod=~"${podRegex(podNames)}"}[5m])) by (pod)`;
}

export function diskWriteQuery(namespace: string, podNames: string[]): string | undefined {
  if (podNames.length === 0) return undefined;
  return `sum(rate(container_fs_writes_bytes_total{namespace="${namespace}",pod=~"${podRegex(podNames)}"}[5m])) by (pod)`;
}

export function sumSamples(samples: { value: number }[]): number {
  return samples.reduce((acc, s) => acc + (Number.isFinite(s.value) ? s.value : 0), 0);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let v = bytes;
  let i = 0;
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatBytesPerSec(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatCores(cores: number): string {
  if (!Number.isFinite(cores)) return '—';
  if (cores < 1) return `${Math.round(cores * 1000)}m`;
  return `${cores.toFixed(2)}`;
}
