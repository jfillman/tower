import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import FullscreenIcon from '@material-ui/icons/Fullscreen';
import FullscreenExitIcon from '@material-ui/icons/FullscreenExit';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { HangarMark } from '../../../brand/HangarMark';
import { DASHBOARDS, DEFAULT_DASHBOARD, isDashboardId, type DashboardId } from './dashboards';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  // The whole point of this page: kept open in a browser tab and
  // fullscreened as a passive glance-status board. requestFullscreen() is
  // called on THIS div, not document.documentElement - the Fullscreen API
  // renders only the target element and its descendants full-bleed, so the
  // Backstage sidebar (a DOM sibling, rendered by ../nav) is automatically
  // not shown while active. No changes to any shared layout/nav code needed.
  root: { backgroundColor: ({ t }) => t.bg, minHeight: '100vh' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 0',
    flexWrap: 'wrap',
    gap: 10,
  },
  headLeft: {},
  backLink: {
    fontFamily: fontMono,
    fontSize: 11.5,
    letterSpacing: '0.04em',
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    marginBottom: 10,
    '&:hover': { color: ({ t }) => t.textHi },
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: 10 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 24, color: ({ t }) => t.textHi },
  headRight: { display: 'flex', alignItems: 'center', gap: 14 },
  clock: { fontFamily: fontMono, fontSize: 14, color: ({ t }) => t.textFaint },
  fsButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fontMono,
    fontSize: 11.5,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: '7px 12px',
    cursor: 'pointer',
    '&:hover': { borderColor: ({ t }) => t.amberLine },
  },
  tabbar: {
    display: 'flex',
    gap: 2,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
    padding: '0 24px',
    marginTop: 14,
    flexWrap: 'wrap',
  },
  tab: {
    fontFamily: fontMono,
    fontSize: 11.5,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    padding: '10px 16px',
    color: ({ t }) => t.textFaint,
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
  },
  tabActive: { color: ({ t }) => t.textHi, borderBottomColor: ({ t }) => t.amber },
  body: { padding: '20px 24px 40px' },
}));

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString();
}

export function TowerDashboardPage({ onBack }: { onBack: () => void }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const clock = useClock();

  const [searchParams, setSearchParams] = useSearchParams();
  const layoutParam = searchParams.get('layout');
  const activeId: DashboardId = isDashboardId(layoutParam) ? layoutParam : DEFAULT_DASHBOARD;
  const selectLayout = useCallback(
    (id: DashboardId) => {
      const next = new URLSearchParams(searchParams);
      next.set('view', 'dashboard');
      next.set('layout', id);
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      rootRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const active = DASHBOARDS.find(d => d.id === activeId) ?? DASHBOARDS[0];
  const { Component } = active;

  return (
    <div className={classes.root} ref={rootRef}>
      <div className={classes.header}>
        <div className={classes.headLeft}>
          <button className={classes.backLink} onClick={onBack} type="button">
            ← All applications
          </button>
          <div className={classes.titleRow}>
            <HangarMark glyph="tower" size={22} />
            <Typography className={classes.title}>Fleet Dashboard</Typography>
          </div>
        </div>
        <div className={classes.headRight}>
          <span className={classes.clock}>{clock}</span>
          <button className={classes.fsButton} onClick={toggleFullscreen} type="button">
            {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      <div className={classes.tabbar}>
        {DASHBOARDS.map(d => (
          <button
            key={d.id}
            type="button"
            className={`${classes.tab} ${activeId === d.id ? classes.tabActive : ''}`}
            onClick={() => selectLayout(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className={classes.body}>
        <Component />
      </div>
    </div>
  );
}
