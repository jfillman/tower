import { useEffect, useRef, useState } from 'react';
import { preventFocusScroll, scrollPanelIntoView } from './preventFocusScroll';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import CheckIcon from '@material-ui/icons/Check';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import AddIcon from '@material-ui/icons/Add';
import { relativeTime, formatDateTime } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { buildSupplyChainStages, PipelineFlow } from './PipelineFlow';
import { PrButton } from './PrButton';
import { slugHue } from './PipelineRunList';
import type { ProvenanceState } from './useReleaseData';
import type { ReleaseCell, ReleaseRow } from './useReleaseContext';
import type { EnvironmentSummary } from './types';

// Top-of-tab release matrix: rows are releases (newest first), columns are
// environments in the app's own real promotionOrder. Reading a column
// answers "what's live where right now"; reading a row answers "did this
// release reach prod, and when" - the two questions the environment-only
// card list and a release-only row list each answered separately. Additive:
// today's per-env ReleaseCard list stays below this, unchanged. Built from
// the "Tower Release Matrix" design artifact (see idp_tower_release_matrix_
// design memory) after the user picked this option 2026-09-08.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    marginBottom: 24,
    overflow: 'hidden',
  },
  head: {
    padding: '14px 20px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sub: { fontSize: 12, color: ({ t }) => t.textLo, marginTop: 2 },
  scroll: { overflowX: 'auto', padding: '4px 20px 18px' },
  table: { borderCollapse: 'collapse', width: '100%', minWidth: 480 },
  colHead: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: ({ t }) => t.textLo,
    textAlign: 'center',
    padding: '0 6px 8px',
  },
  rowHead: {
    textAlign: 'left',
    fontFamily: fontMono,
    fontSize: 11.5,
    fontWeight: 600,
    color: ({ t }) => t.textHi,
    padding: '9px 10px 9px 0',
    whiteSpace: 'nowrap',
  },
  rowHeadLink: {
    font: 'inherit',
    color: 'inherit',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    '&:hover': { color: ({ t }) => t.sky, textDecoration: 'underline' },
  },
  nicknameChip: {
    display: 'inline-block',
    marginLeft: 8,
    fontFamily: fontMono,
    fontWeight: 400,
    fontSize: 10,
    padding: '1px 7px',
    borderRadius: 8,
    border: '1px solid',
    whiteSpace: 'nowrap',
  },
  row: { borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  rowCurrent: { backgroundColor: ({ t }) => t.skySoft },
  rowCurrentHead: { color: ({ t }) => t.sky },
  cellWrap: { display: 'flex', justifyContent: 'center', padding: '7px 3px' },
  cell: {
    width: 24,
    height: 24,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    border: '1px solid transparent',
  },
  cellDeployed: { backgroundColor: ({ t }) => t.goodSoft, color: ({ t }) => t.good },
  cellPending: {
    backgroundColor: ({ t }) => t.amberSoft,
    color: ({ t }) => t.amberInk,
    borderColor: ({ t }) => t.amberLine,
    cursor: 'pointer',
  },
  cellClickable: { cursor: 'pointer' },
  cellNone: { backgroundColor: ({ t }) => t.panelAlt, color: ({ t }) => t.textFaint },
  cellPromotable: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: ({ t }) => t.skyLine,
    color: ({ t }) => t.sky,
    cursor: 'pointer',
  },
  promoteBtn: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    backgroundColor: ({ t }) => t.skySoft,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    borderRadius: 4,
    padding: '6px 12px',
    cursor: 'pointer',
    marginTop: 10,
  },
  expand: {
    margin: '4px 20px 18px',
    paddingTop: 14,
    borderTop: ({ t }) => `1px dashed ${t.line}`,
  },
  expandHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  expandTag: { fontFamily: fontMono, fontSize: 13, fontWeight: 700, color: ({ t }) => t.textHi },
  expandArrow: { color: ({ t }) => t.textFaint, fontSize: 13 },
  expandEnv: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '2px 8px',
    borderRadius: 12,
    border: '1px solid',
  },
  close: {
    marginLeft: 'auto',
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
  },
  prRow: { marginBottom: 10 },
  fact: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 6 },
}));

function CellIcon({ status }: { status: ReleaseCell['status'] }) {
  if (status === 'deployed') return <CheckIcon fontSize="inherit" />;
  if (status === 'pending') return <AutorenewIcon style={{ fontSize: 13 }} />;
  if (status === 'promotable') return <AddIcon style={{ fontSize: 14 }} />;
  return <span>·</span>;
}

interface ExpandKey {
  tag: string;
  env: string;
}

export function ReleaseMatrix({
  releases,
  totalCount,
  environments,
  provenanceByImage,
  onPromote,
}: {
  releases: ReleaseRow[];
  totalCount: number;
  environments: EnvironmentSummary[];
  provenanceByImage: Record<string, ProvenanceState>;
  // Wired to the same PromoteDialog/usePromote flow ReleaseCard's own
  // "Promote to <next env>" button used - just triggered from the matrix's
  // one frontier cell instead of an always-rendered per-env card (see
  // buildReleases' 'promotable' cell status in useReleaseContext.ts). Exactly
  // one of source.env/source.image is set - env for promoting an already-
  // deployed release forward, image for a first deploy of a release that's
  // never been deployed anywhere (2026-09-16: "trigger a promotion to the
  // first env" for a build-only release).
  onPromote: (source: { env?: string; image?: string }, targetEnv: string) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [open, setOpen] = useState<ExpandKey | null>(null);
  const expandRef = useRef<HTMLDivElement>(null);
  // Scroll to the newly opened details section (2026-09-24 feedback); the
  // longer delay covers the surrounding Collapse's own grow animation.
  useEffect(() => {
    if (open) scrollPanelIntoView(() => expandRef.current, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.tag, open?.env]);
  const [, setSearchParams] = useSearchParams();

  if (releases.length === 0) {
    return (
      <div className={classes.wrap}>
        <div className={classes.head}>
          <Typography className={classes.title}>Release matrix</Typography>
          <Typography className={classes.sub}>
            Rows are recent releases, newest first · columns are environments in promotion order.
            Read a column for what's live right now, a row for one release's full journey.
          </Typography>
        </div>
        <div className={classes.scroll}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th />
                {environments.map(env => (
                  <th key={env.key} className={classes.colHead}>
                    {env.env}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={environments.length + 1} style={{ padding: '20px 0', textAlign: 'center' }}>
                  <Typography className={classes.sub}>No releases recorded yet.</Typography>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Deferred from an earlier session ("I'd like the image tag in the
  // release matrix to link to the image in the 'Images' tab"): jumps to
  // that tab with the tag carried in the URL so ImagesTab can scroll to and
  // highlight the matching GHCR version. Merges into existing params
  // (rather than TowerPage's tab-button replace) so `entity` survives -
  // same pattern as OverviewTab's goToNotifications.
  const goToImage = (tag: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'images');
      next.set('imageTag', tag);
      return next;
    });
  };

  const openRow = open ? releases.find(r => r.imageTag === open.tag) : undefined;
  const openCell = openRow && open ? openRow.cells[open.env] : undefined;
  const openProvenance = openRow?.image ? provenanceByImage[openRow.image] : undefined;

  return (
    <div className={classes.wrap}>
      <div className={classes.head}>
        <Typography className={classes.title}>Release matrix</Typography>
        <Typography className={classes.sub}>
          Rows are recent releases, newest first · columns are environments in promotion order.
          Read a column for what's live right now, a row for one release's full journey.
          {totalCount > releases.length
            ? ` Showing the latest ${releases.length} of ${totalCount} known releases.`
            : ''}
        </Typography>
      </div>
      <div className={classes.scroll}>
        <table className={classes.table}>
          <thead>
            <tr>
              <th />
              {environments.map(env => (
                <th key={env.key} className={classes.colHead}>
                  {env.env}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {releases.map(row => (
              <tr key={row.imageTag} className={`${classes.row} ${row.current ? classes.rowCurrent : ''}`}>
                <th className={`${classes.rowHead} ${row.current ? classes.rowCurrentHead : ''}`}>
                  <button
                    type="button"
                    className={classes.rowHeadLink}
                    onClick={() => goToImage(row.imageTag)}
                    title={`View ${row.imageTag} in the Images tab`}
                  >
                    {row.imageTag}
                  </button>
                  {row.nickname && (
                    <span
                      className={classes.nicknameChip}
                      style={{
                        color: `hsl(${slugHue(row.nickname)}, 65%, 60%)`,
                        borderColor: `hsl(${slugHue(row.nickname)}, 65%, 60%)`,
                        backgroundColor: `hsla(${slugHue(row.nickname)}, 65%, 60%, 0.12)`,
                      }}
                      title="This release's build flow, from the CI/CD tab"
                    >
                      {row.nickname}
                    </span>
                  )}
                </th>
                {environments.map(env => {
                  const cell = row.cells[env.env] ?? { status: 'none' as const };
                  const clickable = cell.status !== 'none';
                  const isOpen = open?.tag === row.imageTag && open.env === env.env;
                  return (
                    <td key={env.key}>
                      <div className={classes.cellWrap}>
                        <div
                          role={clickable ? 'button' : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          className={[
                            classes.cell,
                            cell.status === 'deployed' ? classes.cellDeployed : '',
                            cell.status === 'pending' ? classes.cellPending : '',
                            cell.status === 'promotable' ? classes.cellPromotable : '',
                            cell.status === 'none' ? classes.cellNone : '',
                            clickable ? classes.cellClickable : '',
                          ].join(' ')}
                          style={isOpen ? { outline: `2px solid ${t.skyLine}`, outlineOffset: 1 } : undefined}
                          onMouseDown={clickable ? preventFocusScroll : undefined}
                          onClick={clickable ? () => setOpen(isOpen ? null : { tag: row.imageTag, env: env.env }) : undefined}
                          onKeyDown={
                            clickable
                              ? e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setOpen(isOpen ? null : { tag: row.imageTag, env: env.env });
                                  }
                                }
                              : undefined
                          }
                        >
                          <CellIcon status={cell.status} />
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Collapse in={Boolean(openRow && openCell && open)} unmountOnExit>
        {openRow && openCell && open && (
          <div className={classes.expand} ref={expandRef} style={{ scrollMarginTop: 16 }}>
            <div className={classes.expandHead}>
              <span className={classes.expandTag}>{open.tag}</span>
              <span className={classes.expandArrow}>→</span>
              <span className={classes.expandEnv}>{open.env}</span>
              {openCell.status === 'pending' && openCell.pr && (
                <span className={classes.pill} style={{ backgroundColor: t.amberSoft, borderColor: t.amberLine, color: t.amberInk }}>
                  pending
                </span>
              )}
              {openCell.status === 'deployed' && (
                <span className={classes.pill} style={{ backgroundColor: t.goodSoft, borderColor: t.good, color: t.good }}>
                  deployed
                </span>
              )}
              {openCell.status === 'promotable' && (
                <span className={classes.pill} style={{ backgroundColor: t.skySoft, borderColor: t.skyLine, color: t.sky }}>
                  not yet promoted
                </span>
              )}
              <button type="button" className={classes.close} onClick={() => setOpen(null)}>
                close ✕
              </button>
            </div>

            {openCell.status === 'promotable' && openCell.sourceEnv && (
              <>
                <Typography className={classes.fact} style={{ marginTop: 0 }}>
                  Currently live in {openCell.sourceEnv}, not yet in {open.env}.
                </Typography>
                <button
                  type="button"
                  className={classes.promoteBtn}
                  onClick={() => onPromote({ env: openCell.sourceEnv }, open.env)}
                >
                  Promote to {open.env} →
                </button>
              </>
            )}

            {openCell.status === 'promotable' && !openCell.sourceEnv && openCell.sourceImage && (
              <>
                <Typography className={classes.fact} style={{ marginTop: 0 }}>
                  Not yet deployed anywhere - this deploys it to {open.env} for the first time.
                </Typography>
                <button
                  type="button"
                  className={classes.promoteBtn}
                  onClick={() => onPromote({ image: openCell.sourceImage }, open.env)}
                >
                  Deploy to {open.env} →
                </button>
              </>
            )}

            {openCell.status === 'pending' && openCell.pr && (
              <div className={classes.prRow}>
                <PrButton pr={openCell.pr} />
                <Typography className={classes.fact}>updated {relativeTime(openCell.pr.updatedAt)}</Typography>
              </div>
            )}
            {openCell.status === 'deployed' && (
              <Typography className={classes.fact} style={{ marginBottom: openProvenance ? 12 : 0 }}>
                Deployed {openCell.date ? formatDateTime(openCell.date) : 'at an unrecorded time'}
                {openCell.sha ? ` · commit ${openCell.sha.slice(0, 7)}` : ''}
              </Typography>
            )}

            {openProvenance && (
              <PipelineFlow stages={buildSupplyChainStages(openProvenance.data, openProvenance.loading)} />
            )}
            {!openProvenance && openCell.status === 'deployed' && !openRow.image && (
              <Typography className={classes.fact} style={{ fontStyle: 'italic' }}>
                This release is no longer live in any environment, so its supply-chain record isn't
                held in memory here - only what deploy history recorded above.
              </Typography>
            )}
          </div>
        )}
      </Collapse>
    </div>
  );
}
