import type { RunOrigin } from './types';

// Promotion lineage (glidepath docs/admin/api.md#promotion-lineage): a promotion is its own flow, and glidepath-api stamps the
// flow that BUILT its image on the run as annotations. Tower only reads them. Each value is held to the shape glidepath-api
// writes (lineage.Shapes), so a malformed one is dropped here rather than rendered, and a slug or trace never stands alone
// without its chain id. Nothing here is an alert: no origin is no line.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z]{2,20}-[a-z]{2,20}$/;
const TRACE = /^[0-9a-f]{32}$/;

/** The origin a run's annotations name, or undefined (no chain id, or a malformed one). */
export function runOriginOf(annotations: Record<string, string> | undefined): RunOrigin | undefined {
  const chainId = annotations?.['glidepath.io/origin-chain-id'];
  if (!chainId || !UUID.test(chainId)) return undefined;
  const slug = annotations?.['glidepath.io/origin-chain-slug'];
  const trace = annotations?.['glidepath.io/origin-trace-id'];
  return { chainId, ...(slug && SLUG.test(slug) ? { chainSlug: slug } : {}), ...(trace && TRACE.test(trace) ? { traceId: trace } : {}) };
}

/** The trace id of a W3C traceparent (00-<32 hex>-<16 hex>-<2 hex>), or undefined. */
export function traceIdOfTraceparent(traceparent: string | undefined): string | undefined {
  const m = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/.exec(traceparent ?? '');
  return m?.[1];
}
