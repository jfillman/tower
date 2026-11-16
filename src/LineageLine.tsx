import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { chainIdToSlug } from './tekton/chainSlug';
import type { RunOrigin } from './tekton/types';
import { Tooltip, TextLink } from './ui';

// Promotion lineage (docs/design-system.md, "Lineage"): a promotion is its own flow, and the run or record says which flow BUILT
// the image it releases: "<slug> · from <origin slug>". The origin is a LINK (in-app, a real anchor) that opens the Pipelines tab
// filtered to that flow; the history range is widened to 30 days because the build's runs leave the cluster about an hour after
// they end. Lineage is information, not an alert: no origin renders nothing (an origin glidepath-api could not resolve, or none
// of its fields, looks exactly like a run that has no lineage), and nothing here is toned.
//
// The trace: a promotion that joined the build's trace has the same trace id as its origin ("joined": one trace). One that did not
// has its own, so both are shown, the build's second. Trace ids are text to copy, not links: Tower has no trace viewer to link to.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  line: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'baseline' },
  trace: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, userSelect: 'all' },
}));

/** The in-app path that opens the Pipelines tab on one flow (its runs from the last 30 days). */
export function flowHref(slug: string): string {
  return `?tab=pipelines&flow=${encodeURIComponent(slug)}&history=30d`;
}

export function LineageLine({
  slug,
  origin,
  traceId,
}: {
  /** This run's or record's own flow slug, when it has one. */
  slug?: string;
  /** The build flow of the image; nothing renders without one. */
  origin?: RunOrigin;
  /** This run's own trace id, when known (a run list row); a record has none. */
  traceId?: string;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  if (!origin?.chainId) return null;
  const originSlug = origin.chainSlug ?? chainIdToSlug(origin.chainId);
  const buildTrace = origin.traceId;
  const joined = Boolean(traceId && buildTrace && traceId === buildTrace);
  return (
    <span className={c.line} data-testid="lineage">
      <span>
        {slug ? `${slug} · ` : ''}from
      </span>
      {originSlug ? (
        <TextLink to={flowHref(originSlug)} title={`Open the Pipelines tab on ${originSlug}, the flow that built this image`}>
          {originSlug}
        </TextLink>
      ) : (
        <span>the build flow</span>
      )}
      {joined && (
        <Tooltip title="This promotion's spans are in the build's trace">
          <span className={c.trace}>· trace {buildTrace}</span>
        </Tooltip>
      )}
      {!joined && (traceId || buildTrace) && (
        <span className={c.trace}>
          {traceId ? `· trace ${traceId}` : ''}
          {buildTrace ? ` · build trace ${buildTrace}` : ''}
        </span>
      )}
    </span>
  );
}
