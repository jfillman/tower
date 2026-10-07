import { useState, type ReactNode } from 'react';
import type { Notification } from '@backstage/plugin-notifications-common';
import { useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import {
  changeFailureBand,
  deployFrequencyBand,
  leadTimeBand,
  restoreBand,
  type DoraBand,
  type DoraPoint,
  type DoraSnapshot,
} from '../../../fleet/dora';
import type {
  ApprovalItem,
  AttentionItem,
  DeploymentItem,
  LandedItem,
  OpsLink,
  PipelineItem,
  WindowStats,
} from '../../../fleet/opsWallModel';
import { preventFocusScroll } from '../../../preventFocusScroll';
import { BAND_LABEL, bandColor, fmtAge, fmtSeconds, severityColor, useOpsStyles } from './styles';

function useKit() {
  const t = useHangarTokens();
  return { t, c: useOpsStyles({ t }) };
}

// ---- building blocks

export function OpsPanel({
  id,
  title,
  count,
  meta,
  stale,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  meta?: ReactNode;
  /** The data under this panel stopped refreshing; say so and dim it. */
  stale?: string;
  children: ReactNode;
}) {
  const { c } = useKit();
  return (
    <section id={id} className={c.panel} aria-label={title}>
      <div className={c.panelHead}>
        <h2 className={c.panelTitle}>
          {title}
          {count !== undefined && <span className={c.count}>{count}</span>}
        </h2>
        {stale ? <span className={c.staleNote}>{stale}</span> : meta && <span className={c.panelMeta}>{meta}</span>}
      </div>
      <div className={stale ? c.stale : undefined}>{children}</div>
    </section>
  );
}

export function Links({ links }: { links: OpsLink[] }) {
  const { c } = useKit();
  if (links.length === 0) return null;
  return (
    <span className={c.links}>
      {links.map(l => (
        // New tab: the wall stays where it is.
        <a key={l.label + l.href} className={c.link} href={l.href} target="_blank" rel="noopener noreferrer">
          {l.label}
          {l.external ? ' ↗' : ''}
        </a>
      ))}
    </span>
  );
}

function More({ total, shown, label }: { total: number; shown: number; label?: string }) {
  const { c } = useKit();
  if (total <= shown) return null;
  return (
    <div className={c.more}>
      +{total - shown} more{label ? ` ${label}` : ''}
    </div>
  );
}

function Bar({ value, total, color }: { value: number; total: number; color: string }) {
  const { c } = useKit();
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <span className={c.bar} role="img" aria-label={`${value} of ${total}`}>
      <span className={c.barFill} style={{ width: `${pct}%`, backgroundColor: color }} />
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  const { c } = useKit();
  return <div className={c.empty}>{children}</div>;
}

// ---- Needs attention

export function AttentionPanel({
  items,
  now,
  limit,
  stale,
}: {
  items: AttentionItem[];
  now: number;
  limit: number;
  stale?: string;
}) {
  const { t, c } = useKit();
  const shown = items.slice(0, limit);
  const critical = items.filter(i => i.severity === 'critical').length;
  return (
    <OpsPanel
      id="ops-attention"
      title="Needs attention"
      count={items.length}
      meta={critical > 0 ? `${critical} critical` : undefined}
      stale={stale}
    >
      {shown.length === 0 ? (
        <Empty>Nothing needs a human right now.</Empty>
      ) : (
        shown.map(i => (
          <div key={i.id} className={c.row} style={{ borderLeftColor: severityColor(t, i.severity) }}>
            <div className={c.rowMain}>
              <div className={c.rowTop}>
                <span className={c.app}>{i.app}</span>
                {i.env && <span className={c.envTag}>{i.env}</span>}
                <span className={c.rowTitle}>{i.title}</span>
              </div>
              {i.detail && (
                <div className={c.rowDetail} title={i.detail}>
                  {i.detail}
                </div>
              )}
            </div>
            <div className={c.rowSide}>
              {i.since && <span className={c.age}>{fmtAge(now, i.since)}</span>}
              <Links links={i.links} />
            </div>
          </div>
        ))
      )}
      <More total={items.length} shown={shown.length} />
    </OpsPanel>
  );
}

// ---- Pipelines in flight

export function PipelinesPanel({
  items,
  stats,
  windowLabel,
  limit,
  stale,
}: {
  items: PipelineItem[];
  stats: WindowStats;
  windowLabel: string;
  limit: number;
  stale?: string;
}) {
  const { t, c } = useKit();
  const shown = items.slice(0, limit);
  return (
    <OpsPanel
      id="ops-pipelines"
      title="Pipelines in flight"
      count={items.length}
      // Tekton Results archives finished runs after about an hour, so the totals cover what is still live.
      meta={`last ${windowLabel}: ${stats.runs} done · ${stats.failedRuns} failed${
        stats.p50Sec !== undefined ? ` · p50 ${fmtSeconds(stats.p50Sec)}` : ''
      }`}
      stale={stale}
    >
      {shown.length === 0 ? (
        <Empty>No pipelines running.</Empty>
      ) : (
        shown.map(p => {
          let barColor = t.sky;
          if (p.slow || p.queuedLong) barColor = t.amber;
          if ((p.progress?.failed ?? 0) > 0) barColor = t.bad;
          return (
            <div key={p.key} className={c.row} style={{ borderLeftColor: p.slow ? t.amber : 'transparent' }}>
              <div className={c.rowMain}>
                <div className={c.rowTop}>
                  <span className={c.app}>{p.app}</span>
                  <span className={c.envTag}>{p.pipeline}</span>
                  {p.phase === 'pending' && <span className={c.mono}>queued</span>}
                  {p.slow && <span className={c.staleNote}>slow</span>}
                </div>
                <div className={c.rowDetail} title={p.title}>
                  {[p.title, p.sha, p.author && `@${p.author}`, p.prNumber && `PR #${p.prNumber}`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className={c.rowSide}>
                {p.progress && (
                  <>
                    <Bar value={p.progress.done} total={p.progress.total} color={barColor} />
                    <span className={c.mono}>
                      {p.progress.done}/{p.progress.total}
                    </span>
                  </>
                )}
                <span className={c.age}>
                  {fmtSeconds(p.elapsedSec)}
                  {p.typicalSec !== undefined ? ` / ~${fmtSeconds(p.typicalSec)}` : ''}
                </span>
                <Links links={p.links} />
              </div>
            </div>
          );
        })
      )}
      <More total={items.length} shown={shown.length} />
    </OpsPanel>
  );
}

// ---- Deployments in flight, waiting for approval, landed

const KIND_LABEL: Record<DeploymentItem['kind'], string> = {
  release: 'release',
  ground: 'deploy',
  cloud: 'cloud deploy',
  rollout: 'rollout',
};

function toneColors(t: HangarTokens, tone: DeploymentItem['tone']) {
  if (tone === 'bad') return { color: t.bad, backgroundColor: t.badSoft };
  if (tone === 'paused') return { color: t.amberInk, backgroundColor: t.amberSoft };
  return { color: t.sky, backgroundColor: t.skySoft };
}

export function DeploymentsPanel({
  items,
  approvals,
  landed,
  now,
  windowLabel,
  limit,
  stale,
}: {
  items: DeploymentItem[];
  approvals: ApprovalItem[];
  landed: LandedItem[];
  now: number;
  windowLabel: string;
  limit: number;
  stale?: string;
}) {
  const { t, c } = useKit();
  const shown = items.slice(0, limit);
  const landedShown = landed.slice(0, 4);
  return (
    <OpsPanel id="ops-deployments" title="Deployments in flight" count={items.length} stale={stale}>
      {shown.length === 0 ? (
        <Empty>Nothing deploying.</Empty>
      ) : (
        shown.map(d => {
          const canary = d.canary?.weight !== undefined && d.canary.weight < 100 ? d.canary : undefined;
          return (
            <div key={d.key} className={c.row}>
              <div className={c.rowMain}>
                <div className={c.rowTop}>
                  <span className={c.app}>{d.app}</span>
                  <span className={c.envTag}>{d.env}</span>
                  <span className={c.mono}>
                    {[KIND_LABEL[d.kind], d.target, d.cluster].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {d.detail && (
                  <div className={c.rowDetail} title={d.detail}>
                    {d.detail}
                  </div>
                )}
              </div>
              <div className={c.rowSide}>
                {canary && (
                  <>
                    <Bar value={canary.weight ?? 0} total={100} color={t.amber} />
                    <span className={c.mono}>
                      {canary.weight}%
                      {canary.step !== undefined && canary.steps ? ` · ${canary.step + 1}/${canary.steps}` : ''}
                    </span>
                  </>
                )}
                {!canary && d.progress && (
                  <>
                    <Bar value={d.progress.done} total={d.progress.total} color={t.sky} />
                    <span className={c.mono}>
                      {d.progress.done}/{d.progress.total}
                    </span>
                  </>
                )}
                <span className={c.stateChip} style={toneColors(t, d.tone)}>
                  {d.state}
                </span>
                {d.startedAt && <span className={c.age}>{fmtAge(now, d.startedAt)}</span>}
                <Links links={d.links} />
              </div>
            </div>
          );
        })
      )}
      <More total={items.length} shown={shown.length} />

      {approvals.length > 0 && (
        <div id="ops-approvals">
          <div className={c.subhead}>Waiting for approval ({approvals.length})</div>
          {approvals.slice(0, 3).map(a => (
            <div key={a.key} className={c.row}>
              <div className={c.rowMain}>
                <div className={c.rowTop}>
                  <span className={c.app}>{a.app}</span>
                  <span className={c.envTag}>{a.env}</span>
                  <span className={c.mono}>release PR open</span>
                </div>
              </div>
              <div className={c.rowSide}>
                <span className={c.age}>{fmtAge(now, a.since)}</span>
                <Links links={a.prUrl ? [{ label: 'PR', href: a.prUrl, external: true }] : []} />
              </div>
            </div>
          ))}
          <More total={approvals.length} shown={Math.min(3, approvals.length)} />
        </div>
      )}

      <div className={c.subhead}>
        Landed, last {windowLabel} ({landed.length})
      </div>
      {landedShown.length === 0 ? (
        <Empty>No deploys finished in this window.</Empty>
      ) : (
        landedShown.map(l => (
          <div key={l.key} className={c.row}>
            <div className={c.rowMain}>
              <div className={c.rowTop}>
                <span style={{ color: l.ok ? t.good : t.bad }} aria-label={l.ok ? 'succeeded' : 'failed'}>
                  {l.ok ? '✓' : '✗'}
                </span>
                <span className={c.app}>{l.app}</span>
                <span className={c.envTag}>{l.env}</span>
                <span className={c.mono}>{[KIND_LABEL[l.kind], l.cluster].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
            <div className={c.rowSide}>
              <span className={c.age}>{fmtAge(now, l.at)} ago</span>
              <Links links={l.links} />
            </div>
          </div>
        ))
      )}
      <More total={landed.length} shown={landedShown.length} />
    </OpsPanel>
  );
}

// ---- DORA

function Sparkline({ points, color }: { points: DoraPoint[]; color: string }) {
  if (points.length < 2) return null;
  const w = 90;
  const h = 18;
  const max = Math.max(...points.map(p => p.value), 1);
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${(i * step).toFixed(1)},${(h - (p.value / max) * (h - 2) - 1).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function Trend({ now, before, lowerIsBetter }: { now?: number; before?: number; lowerIsBetter?: boolean }) {
  const { t, c } = useKit();
  if (now === undefined || before === undefined || before === now) return null;
  const up = now > before;
  const good = lowerIsBetter ? !up : up;
  return (
    <span className={c.mono} style={{ color: good ? t.good : t.bad }} title="vs the previous window">
      {up ? '▲' : '▼'}
    </span>
  );
}

function DoraTile({
  label,
  value,
  unit,
  band,
  spark,
  trend,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  band: DoraBand;
  spark?: ReactNode;
  trend?: ReactNode;
  note?: string;
}) {
  const { t, c } = useKit();
  return (
    <div className={c.doraTile}>
      <div className={c.kpiLabel}>{label}</div>
      <div className={c.doraValue} style={{ color: band === 'neutral' ? t.textHi : bandColor(t, band) }}>
        {value}
        {unit && <span className={c.doraUnit}>{unit}</span>}
      </div>
      <div className={c.doraFoot}>
        {BAND_LABEL[band] && (
          <span
            className={c.stateChip}
            style={{ color: bandColor(t, band), border: `1px solid ${bandColor(t, band)}` }}
          >
            {BAND_LABEL[band]}
          </span>
        )}
        {trend}
        {spark}
        {note && <span className={c.mono}>{note}</span>}
      </div>
    </div>
  );
}

const pct = (r: number | undefined) => (r === undefined ? '—' : `${Math.round(r * 100)}%`);

export function DoraPanel({
  snapshot,
  error,
  loading,
  stale,
  sourceLabel,
  windowDays,
  windows,
  onWindow,
}: {
  snapshot?: DoraSnapshot;
  error?: string;
  loading: boolean;
  stale?: string;
  sourceLabel: string;
  windowDays: number;
  windows: readonly number[];
  onWindow: (days: number) => void;
}) {
  const { t, c } = useKit();
  const [perApp, setPerApp] = useState(false);
  const controls = (
    <span className={c.links}>
      {windows.map(w => (
        <button
          key={w}
          type="button"
          className={`${c.toggle} ${w === windowDays ? c.toggleOn : ''}`}
          onMouseDown={preventFocusScroll}
          onClick={() => onWindow(w)}
        >
          {w}d
        </button>
      ))}
      <button
        type="button"
        className={`${c.toggle} ${perApp ? c.toggleOn : ''}`}
        onMouseDown={preventFocusScroll}
        onClick={() => setPerApp(v => !v)}
      >
        per app
      </button>
    </span>
  );

  let body: ReactNode;
  if (!snapshot && error) {
    body = (
      <Empty>
        DORA metrics are unavailable: {sourceLabel} did not answer ({error}).
      </Empty>
    );
  } else if (!snapshot) {
    body = <Empty>{loading ? 'Loading DORA metrics…' : 'No DORA data.'}</Empty>;
  } else {
    const s = snapshot;
    const releasesLabel =
      s.releases !== undefined ? `${Math.round(s.failures ?? 0)}/${Math.round(s.releases)} releases` : undefined;
    body = (
      <>
        <div className={c.doraGrid}>
          <DoraTile
            label="Deploy frequency"
            value={s.deploysPerDay === undefined ? '—' : s.deploysPerDay.toFixed(s.deploysPerDay < 10 ? 1 : 0)}
            unit="/ day"
            band={deployFrequencyBand(s.deploysPerDay)}
            trend={<Trend now={s.deploysPerDay} before={s.deploysPerDayPrevious} />}
            spark={<Sparkline points={s.deploysDaily} color={t.sky} />}
          />
          <DoraTile
            label="Lead time (p50)"
            value={fmtSeconds(s.leadTimeP50Sec)}
            band={leadTimeBand(s.leadTimeP50Sec)}
            note="commit → live"
          />
          <DoraTile
            label="Change failure rate"
            value={pct(s.changeFailureRate)}
            band={changeFailureBand(s.changeFailureRate)}
            trend={<Trend now={s.changeFailureRate} before={s.changeFailureRatePrevious} lowerIsBetter />}
            spark={<Sparkline points={s.failuresDaily} color={t.bad} />}
            note={releasesLabel}
          />
          <DoraTile
            label="Time to restore (p50)"
            value={fmtSeconds(s.restoreP50Sec)}
            band={restoreBand(s.restoreP50Sec)}
            note="experimental"
          />
        </div>
        {perApp &&
          (s.apps.length === 0 ? (
            <Empty>No releases in this window.</Empty>
          ) : (
            <table className={c.table}>
              <thead>
                <tr>
                  <th className={c.th}>App</th>
                  <th className={c.th}>Deploys</th>
                  <th className={c.th}>/ day</th>
                  <th className={c.th}>Lead p50</th>
                  <th className={c.th}>Fail rate</th>
                  <th className={c.th}>Restore p50</th>
                </tr>
              </thead>
              <tbody>
                {s.apps.map(a => (
                  <tr key={a.app}>
                    <td className={c.td}>{a.app}</td>
                    <td className={c.td}>{a.deploys}</td>
                    <td className={c.td}>{(a.deploys / s.windowDays).toFixed(2)}</td>
                    <td className={c.td} style={{ color: bandColor(t, leadTimeBand(a.leadTimeP50Sec)) }}>
                      {fmtSeconds(a.leadTimeP50Sec)}
                    </td>
                    <td className={c.td} style={{ color: bandColor(t, changeFailureBand(a.changeFailureRate)) }}>
                      {pct(a.changeFailureRate)} ({a.failures}/{a.releases})
                    </td>
                    <td className={c.td}>{fmtSeconds(a.restoreP50Sec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        <div className={c.doraNote}>
          Upper-environment releases recorded by Glidepath. Change failure rate counts failed releases, not production
          incidents; time to restore is the gap from a failed release to the next good one. Source: {sourceLabel}.
        </div>
      </>
    );
  }

  return (
    <OpsPanel id="ops-dora" title={`DORA · last ${windowDays} days`} meta={controls} stale={stale}>
      {body}
    </OpsPanel>
  );
}

// ---- Activity

export function ActivityPanel({
  items,
  now,
  limit,
  stale,
  error,
}: {
  items: Notification[];
  now: number;
  limit: number;
  stale?: string;
  error?: string;
}) {
  const { t, c } = useKit();
  const shown = items.slice(0, limit);
  return (
    <OpsPanel id="ops-activity" title="Activity" stale={stale}>
      {shown.length === 0 ? (
        <Empty>{error ? `Notifications unavailable (${error}).` : 'No recent activity.'}</Empty>
      ) : (
        shown.map(n => {
          const sev = n.payload.severity;
          let edge = 'transparent';
          if (sev === 'critical' || sev === 'high') edge = t.bad;
          else if (sev === 'low') edge = t.line;
          const link = n.payload.link;
          return (
            <div key={n.id} className={c.row} style={{ borderLeftColor: edge }}>
              <div className={c.rowMain}>
                <div className={c.rowTitle}>{n.payload.title}</div>
                {n.payload.description && (
                  <div className={c.rowDetail} title={n.payload.description}>
                    {n.payload.description.split('\n')[0]}
                  </div>
                )}
              </div>
              <div className={c.rowSide}>
                <span className={c.age}>{fmtAge(now, String(n.created))}</span>
                {link && <Links links={[{ label: 'Open', href: link, external: /^https?:/.test(link) }]} />}
              </div>
            </div>
          );
        })
      )}
    </OpsPanel>
  );
}
