import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import FlightIcon from '@material-ui/icons/Flight';
import TerrainIcon from '@material-ui/icons/Terrain';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { TallArrow } from './SignalRail';
import { preventFocusScroll } from './preventFocusScroll';
import { ImageTagPill } from './tabs/deployments/ImageTagPill';
import { ENV_TIER_LABEL, type EnvTier, type Health } from './types';

// The tiered Ground/Flight env picker built for "Ground Control" (the
// Deployments tab redesign) - pulled out into its own shared component so
// the Topology tab can use the literal same picker rather than a
// lookalike copy (2026-09-17 Topology modernization, item 1: "use the same
// env picker that we use in the Deployments tab"). Purely presentational -
// each caller computes its own tier grouping/health/image-pill data (they
// have genuinely different real inputs: Deployments tracks CD-delivery
// "incoming" state, Topology doesn't), this component only ever renders
// what it's handed.

export interface EnvPickerItem {
  key: string;
  envName: string;
  cluster: string;
  health: Health;
  active: boolean;
  imageTag?: string;
  imageNickname?: string;
  // An incoming release is currently in flight for this env (Deployments-
  // only concept - Topology has no per-env delivery to be "incoming").
  incoming?: boolean;
  onClick: () => void;
}

export interface EnvPickerGroup {
  tier: EnvTier;
  items: EnvPickerItem[];
  // Label shown on the connector row above this group (skipped for the
  // first group, which has nothing above it to connect from). Defaults to
  // "promotes to" for a real tier transition; Preview isn't part of the
  // promotion chain, so a caller including it should override this.
  connectorLabel?: string;
  // Whether the connector row shows a directional arrow - off for a
  // transition that isn't really "promotion" (e.g. into a Preview group).
  showConnectorArrow?: boolean;
}

export const useEnvPickerStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  envBarWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '10px 12px',
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8,
    backgroundColor: ({ t }) => t.panel,
  },
  envBarSummary: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  tierRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tierConnector: { display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0 1px 42px' },
  tierConnectorArrow: { color: ({ t }) => t.amber, display: 'flex' },
  tierConnectorLabel: { fontFamily: fontMono, fontSize: 9.5, color: ({ t }) => t.textFaint, fontStyle: 'italic' },
  tierLabel: {
    fontFamily: fontMono,
    fontSize: 9.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: ({ t }) => t.textFaint,
    flexShrink: 0,
    width: 42,
  },
  envItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 20,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    cursor: 'pointer',
    textAlign: 'left',
    '&:hover': { backgroundColor: ({ t }) => t.bg },
  },
  envItemActive: { backgroundColor: ({ t }) => t.skySoft, borderColor: ({ t }) => t.skyLine },
  envItemIncoming: { borderColor: ({ t }) => t.amberLine },
  envItemUpper: {
    borderRadius: 6,
    borderTopWidth: 3,
    borderTopColor: ({ t }) => t.textHi,
  },
  // Preview envs are ephemeral, second-class citizens compared to a real
  // Ground/Flight environment - dashed border + reduced opacity says that
  // at a glance, matching the treatment the old per-env Topology cards used.
  envItemPreview: { borderStyle: 'dashed', opacity: 0.82 },
  tierIcon: { flexShrink: 0, display: 'flex', color: ({ t }) => t.textFaint, opacity: 0.7, fontSize: 14 },
  envName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi, lineHeight: 1.3 },
  envMeta: { display: 'flex', flexDirection: 'column', gap: 1 },
  envCluster: { fontFamily: fontMono, fontSize: 9.5, color: ({ t }) => t.textFaint },
  envImageRow: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 },
  incomingTag: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.amberInk, fontWeight: 700 },
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  tierArrow: { color: ({ t }) => t.amber, flexShrink: 0, display: 'flex' },
}));

function dotColor(t: HangarTokens, h: Health): string {
  if (h === 'healthy') return t.good;
  if (h === 'progressing' || h === 'paused') return t.amber;
  return t.bad;
}

function tierIconFor(tier: EnvTier) {
  if (tier === 'upper') return <FlightIcon fontSize="inherit" />;
  if (tier === 'preview') return <HourglassEmptyIcon fontSize="inherit" />;
  return <TerrainIcon fontSize="inherit" />;
}

export function EnvPicker({
  groups,
  summary,
  showConnectors = true,
}: {
  groups: EnvPickerGroup[];
  summary?: string;
  // Off for a caller with no real promotion chain to depict (Topology's env
  // picker is a plain selector - "promotes to" and the between-env chevrons
  // both implied a pipeline relationship that doesn't apply there, 2026-09-17
  // bug report). Deployments keeps the default: it's the one place those
  // connectors are actually true.
  showConnectors?: boolean;
}) {
  const t = useHangarTokens();
  const classes = useEnvPickerStyles({ t });

  return (
    <div className={classes.envBarWrap}>
      {summary && <span className={classes.envBarSummary}>{summary}</span>}
      {groups.map((g, gi) => (
        <div key={g.tier} style={{ display: 'contents' }}>
          {showConnectors && gi > 0 && (
            <div className={classes.tierConnector}>
              {(g.showConnectorArrow ?? true) && (
                <span className={classes.tierConnectorArrow}>
                  <TallArrow size={16} rotate={90} />
                </span>
              )}
              <span className={classes.tierConnectorLabel}>{g.connectorLabel ?? 'promotes to'}</span>
            </div>
          )}
          <div className={classes.tierRow}>
            <span className={classes.tierLabel}>{ENV_TIER_LABEL[g.tier]}</span>
            {g.items.map((item, i) => (
              <div key={item.key} style={{ display: 'contents' }}>
                {showConnectors && i > 0 && (
                  <span className={classes.tierArrow}>
                    <TallArrow size={16} />
                  </span>
                )}
                <button
                  type="button"
                  className={`${classes.envItem} ${g.tier === 'upper' ? classes.envItemUpper : ''} ${
                    g.tier === 'preview' ? classes.envItemPreview : ''
                  } ${item.active ? classes.envItemActive : ''} ${item.incoming ? classes.envItemIncoming : ''}`}
                  onMouseDown={preventFocusScroll}
                  onClick={item.onClick}
                >
                  <span className={classes.statusDot} style={{ backgroundColor: dotColor(t, item.health) }} title={item.health} />
                  <span className={classes.tierIcon} title={ENV_TIER_LABEL[g.tier]}>
                    {tierIconFor(g.tier)}
                  </span>
                  <span className={classes.envMeta}>
                    <span className={classes.envName}>{item.envName}</span>
                    <span className={classes.envCluster}>{item.cluster}</span>
                    {item.imageTag && (
                      <span className={classes.envImageRow}>
                        {item.incoming && <span className={classes.incomingTag}>⇢</span>}
                        <ImageTagPill tag={item.imageTag} nickname={item.imageNickname} size="small" />
                      </span>
                    )}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
