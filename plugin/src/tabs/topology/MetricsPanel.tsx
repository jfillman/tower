import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import MemoryIcon from '@material-ui/icons/Memory';
import SpeedIcon from '@material-ui/icons/Speed';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import StorageIcon from '@material-ui/icons/Storage';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { preventFocusScroll } from '../../preventFocusScroll';
import { usePrometheusRangeQuery, type PrometheusSeries } from '../../usePrometheusQuery';
import {
  cpuUsageQuery,
  diskReadQuery,
  diskWriteQuery,
  formatBytesPerSec,
  formatCores,
  memoryUsageQuery,
  networkRxQuery,
  networkTxQuery,
} from './metricsQueries';

// Item 5 of the Topology-tab modernization: CPU, memory, network in/out and
// disk IO, the metrics anyone reaches for first when looking at a running
// workload. Reads straight off the same kube-prometheus-stack instance
// usePrometheusQuery.ts already targets for SLO/canary data - no new
// backend route. A range query (not just an instant one) so each tile can
// show a real trend line, not just a single point that might land on either
// side of a scrape-interval spike.

const RANGE_SECONDS = 15 * 60;
const STEP_SECONDS = 30;
const POLL_MS = 20_000;

function sumSeriesAtEachPoint(series: PrometheusSeries[]): Array<{ time: number; value: number }> {
  const byTime = new Map<number, number>();
  series.forEach(s =>
    s.points.forEach(p => {
      byTime.set(p.time, (byTime.get(p.time) ?? 0) + (Number.isFinite(p.value) ? p.value : 0));
    }),
  );
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  panel: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 10,
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  liveToggle: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '3px 9px',
    borderRadius: 12,
    border: ({ t }) => `1px solid ${t.line}`,
    background: 'none',
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  liveToggleActive: { color: ({ t }) => t.amberInk, borderColor: ({ t }) => t.amberLine, backgroundColor: ({ t }) => t.amberSoft },
  liveDot: { width: 6, height: 6, borderRadius: '50%', backgroundColor: ({ t }) => t.amber, animation: '$pulse 1.6s ease-in-out infinite' },
  '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  tile: {
    padding: '10px 12px',
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  tileHead: { display: 'flex', alignItems: 'center', gap: 6, color: ({ t }) => t.textFaint },
  tileIcon: { display: 'flex', fontSize: 15 },
  tileLabel: { fontFamily: fontMono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' },
  tileValue: { fontFamily: fontMono, fontWeight: 700, fontSize: 18, color: ({ t }) => t.textHi },
  tileNote: { fontSize: 10.5, fontStyle: 'italic', color: ({ t }) => t.textFaint },
  note: { fontSize: 12, fontStyle: 'italic', color: ({ t }) => t.textLo },
}));

function Sparkline({ points, color, t }: { points: Array<{ time: number; value: number }>; color: string; t: HangarTokens }) {
  const width = 130;
  const height = 30;
  if (points.length < 2) return <svg width={width} height={height} />;
  const values = points.map(p => p.value);
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.value - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={areaPath} fill={color} opacity={0.14} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      <circle cx={width} cy={height - ((values[values.length - 1] - min) / span) * height} r={2.2} fill={color} />
      <text x={0} y={height + 9} fontFamily={fontMono} fontSize={8} fill={t.textFaint}>
        15m
      </text>
    </svg>
  );
}

function MetricTile({
  icon,
  label,
  query,
  cluster,
  format,
  color,
  refreshNonce,
  classes,
  t,
}: {
  icon: JSX.Element;
  label: string;
  query: string | undefined;
  cluster: string;
  format: (v: number) => string;
  color: string;
  refreshNonce: number;
  classes: ReturnType<typeof useStyles>;
  t: HangarTokens;
}) {
  const { loading, error, series } = usePrometheusRangeQuery(
    cluster,
    query,
    RANGE_SECONDS,
    STEP_SECONDS,
    refreshNonce,
  );
  const points = sumSeriesAtEachPoint(series);
  const current = points.length > 0 ? points[points.length - 1].value : undefined;

  let body: JSX.Element;
  if (!query) {
    body = <Typography className={classes.tileNote}>no pods</Typography>;
  } else if (loading && points.length === 0) {
    body = <Typography className={classes.tileNote}>loading…</Typography>;
  } else if (error) {
    body = <Typography className={classes.tileNote}>unavailable</Typography>;
  } else {
    body = (
      <>
        <span className={classes.tileValue}>{current !== undefined ? format(current) : '—'}</span>
        <Sparkline points={points} color={color} t={t} />
      </>
    );
  }

  return (
    <div className={classes.tile}>
      <div className={classes.tileHead}>
        <span className={classes.tileIcon}>{icon}</span>
        <span className={classes.tileLabel}>{label}</span>
      </div>
      {body}
    </div>
  );
}

// `podNames` scopes the whole panel - the caller passes every pod in the
// environment for a workload-wide strip, or just one pod's name for a
// single-pod view (PodDetail) - the same tile set either way, just a
// narrower sum().
export function MetricsPanel({
  cluster,
  namespace,
  podNames,
  title = 'Performance',
}: {
  cluster: string;
  namespace: string;
  podNames: string[];
  title?: string;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [live, setLive] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => setNonce(n => n + 1), POLL_MS);
    return () => clearInterval(id);
  }, [live]);

  if (podNames.length === 0) {
    return (
      <div className={classes.panel}>
        <Typography className={classes.title}>{title}</Typography>
        <Typography className={classes.note}>No running pods to measure.</Typography>
      </div>
    );
  }

  const cpuQuery = cpuUsageQuery(namespace, podNames);
  const memQuery = memoryUsageQuery(namespace, podNames);
  const rxQuery = networkRxQuery(namespace, podNames);
  const txQuery = networkTxQuery(namespace, podNames);
  const readQuery = diskReadQuery(namespace, podNames);
  const writeQuery = diskWriteQuery(namespace, podNames);

  return (
    <div className={classes.panel}>
      <div className={classes.head}>
        <Typography className={classes.title}>
          {title} <span style={{ fontWeight: 400, color: t.textFaint }}>· {podNames.length} pod{podNames.length === 1 ? '' : 's'}</span>
        </Typography>
        <button
          type="button"
          className={`${classes.liveToggle} ${live ? classes.liveToggleActive : ''}`}
          onMouseDown={preventFocusScroll}
          onClick={() => setLive(v => !v)}
        >
          {live && <span className={classes.liveDot} />}
          {live ? 'live · 20s' : 'live off'}
        </button>
      </div>
      <div className={classes.grid}>
        <MetricTile icon={<SpeedIcon fontSize="inherit" />} label="CPU" query={cpuQuery} cluster={cluster} format={formatCores} color={t.sky} refreshNonce={nonce} classes={classes} t={t} />
        <MetricTile icon={<MemoryIcon fontSize="inherit" />} label="Memory" query={memQuery} cluster={cluster} format={v => formatBytesPerSec(v).replace('/s', '')} color={t.amber} refreshNonce={nonce} classes={classes} t={t} />
        <MetricTile icon={<ArrowDownwardIcon fontSize="inherit" />} label="Network in" query={rxQuery} cluster={cluster} format={formatBytesPerSec} color={t.good} refreshNonce={nonce} classes={classes} t={t} />
        <MetricTile icon={<ArrowUpwardIcon fontSize="inherit" />} label="Network out" query={txQuery} cluster={cluster} format={formatBytesPerSec} color={t.good} refreshNonce={nonce} classes={classes} t={t} />
        <MetricTile icon={<StorageIcon fontSize="inherit" />} label="Disk read" query={readQuery} cluster={cluster} format={formatBytesPerSec} color={t.textLo} refreshNonce={nonce} classes={classes} t={t} />
        <MetricTile icon={<StorageIcon fontSize="inherit" />} label="Disk write" query={writeQuery} cluster={cluster} format={formatBytesPerSec} color={t.textLo} refreshNonce={nonce} classes={classes} t={t} />
      </div>
    </div>
  );
}
