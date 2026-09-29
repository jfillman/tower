function podRegex(podNames) {
  return podNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}
function cpuUsageQuery(namespace, podNames) {
  if (podNames.length === 0) return void 0;
  return `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",pod=~"${podRegex(podNames)}",container!="",container!="POD"}[5m])) by (pod)`;
}
function memoryUsageQuery(namespace, podNames) {
  if (podNames.length === 0) return void 0;
  return `sum(container_memory_working_set_bytes{namespace="${namespace}",pod=~"${podRegex(podNames)}",container!="",container!="POD"}) by (pod)`;
}
function networkRxQuery(namespace, podNames) {
  if (podNames.length === 0) return void 0;
  return `sum(rate(container_network_receive_bytes_total{namespace="${namespace}",pod=~"${podRegex(podNames)}"}[5m])) by (pod)`;
}
function networkTxQuery(namespace, podNames) {
  if (podNames.length === 0) return void 0;
  return `sum(rate(container_network_transmit_bytes_total{namespace="${namespace}",pod=~"${podRegex(podNames)}"}[5m])) by (pod)`;
}
function diskReadQuery(namespace, podNames) {
  if (podNames.length === 0) return void 0;
  return `sum(rate(container_fs_reads_bytes_total{namespace="${namespace}",pod=~"${podRegex(podNames)}"}[5m])) by (pod)`;
}
function diskWriteQuery(namespace, podNames) {
  if (podNames.length === 0) return void 0;
  return `sum(rate(container_fs_writes_bytes_total{namespace="${namespace}",pod=~"${podRegex(podNames)}"}[5m])) by (pod)`;
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "\u2014";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = bytes;
  let i = 0;
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
function formatBytesPerSec(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}
function formatCores(cores) {
  if (!Number.isFinite(cores)) return "\u2014";
  if (cores < 1) return `${Math.round(cores * 1e3)}m`;
  return `${cores.toFixed(2)}`;
}

export { cpuUsageQuery, diskReadQuery, diskWriteQuery, formatBytes, formatBytesPerSec, formatCores, memoryUsageQuery, networkRxQuery, networkTxQuery };
//# sourceMappingURL=metricsQueries.esm.js.map
