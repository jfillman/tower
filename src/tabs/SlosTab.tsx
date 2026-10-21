import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Tooltip from '@material-ui/core/Tooltip';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { RefreshButton } from '../RefreshButton';
import { Card, Chip, ColumnLabel, Count, EmptyNote, PageHeader, Section, SectionTitle, Stat, StatusChip, TextLink, TierChip } from '../ui';
import { TowerEmptyState } from '../TowerEmptyState';
import { useSlos } from '../useSlos';
import { usePrometheusInstantQuery } from '../usePrometheusQuery';
import { envTierOf, type SloSummary } from '../types';
import { useReleaseContext } from '../useReleaseContext';

// Real Sloth-backed SLO burn-rate view, first built once a live SLO instance
// existed anywhere to verify against (see HANDOFF-tower-slos.md - the SLO
// XRD/composition/Sloth chain was installed but had zero real instances
// before this session added checkout-api's own). Covers every environment
// an app has (not flight-only like Config), matching Topology's scope - a
// user decision for this session, since burn-rate is exactly the kind of
// signal you want everywhere, not just upper envs.
//
// Queries Prometheus directly for two things per SLO, both via the shared
// usePrometheusInstantQuery hook (packages/app/src/modules/tower/
// usePrometheusQuery.ts) rather than a Grafana panel embed - deliberately a
// DIFFERENT mechanism from Overview's still-unbuilt "Grafana panels" section
// (see that tab's own placeholder): this renders Tower-native hand-drawn
// charts from raw PromQL, consistent with CanaryRampChart's existing style,
// not an iframe. A __name__=~ regex selector groups every meta/windowed
// recording rule for one SLO into a single query each, rather than one
// request per metric.
const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  envGroup: { marginBottom: 26 },
  grid: { display: 'flex', flexDirection: 'column', gap: 14 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  sub: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, marginTop: 2 },
  explainer: { fontSize: 13, lineHeight: 1.5, color: ({ t }) => t.textLo, margin: '2px 0 14px' },
  windowsCaption: { fontSize: 11.5, lineHeight: 1.4, color: ({ t }) => t.textFaint, margin: '2px 0 6px' },
  headRight: { display: 'flex', alignItems: 'center', gap: 8 },
  statsRow: { display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 },
  budget: { flex: '1 1 220px', display: 'flex', flexDirection: 'column' },
  budgetTrack: { height: 8, borderRadius: 4, backgroundColor: ({ t }) => t.panelAlt, overflow: 'hidden', marginTop: 6 },
  budgetFill: { height: '100%', borderRadius: 4 },
  // alignItems left at its 'stretch' default (not 'flex-end') - .windowBar
  // needs to actually receive this container's 60px height so its own
  // flex:1 child can resolve a real pixel height for the bar-fill's
  // percentage height to size against. 'flex-end' here would size every
  // .windowBar to its own content height instead (near-zero), silently
  // collapsing every bar to nothing regardless of real data - confirmed
  // live 2026-09-13 on checkout-api-liveness-latency: real Prometheus data
  // was arriving (verified via the actual network response), the chart
  // area was just empty.
  windows: { display: 'flex', gap: 6, height: 60, marginTop: 4, marginBottom: 4 },
  windowBar: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 0', gap: 4 },
  windowBarFill: { width: '100%', maxWidth: 22, borderRadius: '2px 2px 0 0' },
  windowLabel: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  query: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, backgroundColor: ({ t }) => t.panelAlt, padding: '6px 8px', borderRadius: 4, marginTop: 8, overflowX: 'auto', whiteSpace: 'pre' },
}));

const WINDOWS = ['5m', '30m', '1h', '2h', '6h', '1d', '3d', '30d'] as const;

// Environments are told apart by their name and their tier chip (Ground sky, Flight amber), the same as every other
// tab. The per-environment violet/rose/teal/olive hues this tab used to give each group were not Hangar colours
// (user decision, 2026-10-11).
const UNKNOWN_ENV_KEY = '(no environment)';

// 2026-09-15: sloth_slo alone is no longer a unique series selector once
// the same SLO name/service is promoted to more than one environment
// (deliberately allowed - see the XRD's own environmentRef comment).
//
// FIRST attempt at this fix matched on a separate `namespace` label
// instead of the `/`-suffix below - airframe's composition added it as a
// Sloth `labels` field on each generated rule. That correctly disambiguated
// the leaf recording rules, but broke every rule Sloth computes by DIVIDING
// two of its own recording rules together (slo:current_burn_rate:ratio,
// slo:sli_error:ratio_rate30d): confirmed live, both went health=err
// ("many-to-many matching not allowed") - Sloth's own generated PromQL
// joins strictly on(sloth_id,sloth_service,sloth_slo), so a label outside
// that fixed set doesn't disambiguate its OWN internal arithmetic, it just
// rides along on what Prometheus still sees as two equally-valid matches
// for that three-label key.
//
// Real fix, matching airframe's composition template (prometheusservicelevel.yaml's
// own comment has the full story): the value INSIDE that fixed match key -
// sloth_slo itself - now differs per environment, built the identical way
// the composition does (`<name>_<namespace>`). `_`, not `/` - a SECOND
// attempt used `/` (safe against Kubernetes' own naming rules) but Sloth
// v0.16.0 rejects `/` in its own SLO name validation, confirmed live:
// every SLO using it got stuck at Ready: False, promOpRulesGenerated:
// false, rather than the softer "wrong data" failure mode `namespace` as
// a label caused. `_` is in Sloth's own allowed charset (alphanumeric,
// '.', '_', '-') and - like `/` - still guaranteed never to appear in a
// Kubernetes namespace name, so it satisfies both constraints at once.
function selectorFor(slo: SloSummary): string {
  return `sloth_service="${slo.service}",sloth_slo="${slo.name}_${slo.namespace}"`;
}

function metaValue(samples: ReturnType<typeof usePrometheusInstantQuery>['samples'], metric: string): number | undefined {
  return samples.find(s => s.metric.__name__ === metric)?.value;
}

// Simple two-tier severity, not Sloth/Alertmanager's real multi-window-
// multi-burn-rate alert pairing (that logic already lives server-side in the
// generated PrometheusRule's alert group - see HANDOFF-tower-slos.md) - this
// is a glance-value for the dashboard, not a re-implementation of the
// alerting policy. >1 means consuming budget faster than the compliance
// period allows; >2 is a blunt "clearly bad" threshold on top of that.
type Tone = 'ok' | 'warn' | 'bad' | undefined;

function burnRateTone(rate: number | undefined): Tone {
  if (rate === undefined) return undefined;
  if (rate > 2) return 'bad';
  if (rate > 1) return 'warn';
  return 'ok';
}

function budgetTone(remaining: number | undefined): Tone {
  if (remaining === undefined) return undefined;
  if (remaining < 0.2) return 'bad';
  if (remaining < 0.5) return 'warn';
  return 'ok';
}

function verdictTone(meeting: boolean | undefined): Tone {
  if (meeting === undefined) return undefined;
  return meeting ? 'ok' : 'bad';
}

function toneColor(t: HangarTokens, tone: Tone): string {
  if (tone === 'bad') return t.bad;
  if (tone === 'warn') return t.amberInk;
  if (tone === 'ok') return t.good;
  return t.textFaint;
}

// A plain-language reading of the same numbers the stat grid below already
// shows in full precision - 2026-09-14: "the SLO tab is number/metrics
// heavy... a fuzzy human explainer on what you're looking at would be
// helpful". Deliberately generated from the same real fields already
// fetched (no new query) rather than a canned template per SLO - stays
// honest for an indicator this hasn't been hand-written for yet (falls back
// to the raw metric name instead of guessing a friendly noun).
function humanSummary(slo: SloSummary, currentSli: number | undefined, meetingObjective: boolean | undefined, periodDays: number | undefined): string {
  if (currentSli === undefined) return '';
  const probeMatch = slo.indicator.totalFilter.match(/probe_type="(\w+)"/);
  const subject = probeMatch ? `${slo.service}'s ${probeMatch[1].toLowerCase()} probe` : `${slo.service}'s ${slo.indicator.metric}`;
  let verb: string;
  if (slo.indicator.type === 'latency' && slo.indicator.latencyThreshold) {
    const seconds = Number(slo.indicator.latencyThreshold);
    const thresholdText = seconds < 1 ? `${Math.round(seconds * 1000)}ms` : `${seconds}s`;
    verb = `responded within ${thresholdText}`;
  } else {
    verb = 'succeeded';
  }
  const period = periodDays !== undefined ? ` over the last ${periodDays} days` : '';
  let verdict = '';
  if (meetingObjective === true) verdict = ` — comfortably inside the ${slo.objective}% target.`;
  else if (meetingObjective === false) {
    verdict = ` — short of the ${slo.objective}% target, so this SLO is breaching its objective and burning through its error budget.`;
  }
  return `${currentSli.toFixed(1)}% of ${subject} checks${period} ${verb}${verdict}`;
}

// Per-bar hover text for "SLI error ratio by window" - 2026-09-14: "what is
// the actual value that the chart represents? maybe a hover over can
// explain?". Each bar is Sloth's own slo:sli_error:ratio_rate<window>
// recording rule: the fraction of events in that trailing window alone
// that were "bad" (over the latency threshold, or errored for an
// availability indicator) - NOT compared against the 30d compliance period
// the headline SLI/verdict use, just that one window's own local error
// rate. A window's own bar turns red when ITS ratio alone already exceeds
// the error budget - a quick way to spot whether badness is recent (short
// windows red, long windows fine) or historical (the reverse).
function windowTooltip(window: string, ratio: number | undefined, errorBudgetRatio: number | undefined): string {
  if (ratio === undefined) return `${window}: no data for this window yet`;
  const pct = (ratio * 100).toFixed(3);
  if (errorBudgetRatio === undefined) return `${window}: ${pct}% of checks were bad in this window`;
  const budgetPct = (errorBudgetRatio * 100).toFixed(2);
  const verdict = ratio > errorBudgetRatio ? 'over' : 'within';
  return `${window}: ${pct}% of checks were bad in this window - ${verdict} the ${budgetPct}% budget this objective allows`;
}

function SloCard({
  slo,
  refreshNonce,
}: {
  slo: SloSummary;
  refreshNonce: number;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [showDetails, setShowDetails] = useState(false);
  const selector = selectorFor(slo);

  const meta = usePrometheusInstantQuery(
    slo.cluster,
    // time_period (not time_period_days) - the real recording rule is named
    // slo:time_period:days (confirmed live 2026-09-14: the underscore
    // version never matched anything, silently leaving periodDays
    // undefined on every SLO card - masked on the working one since it only
    // blanks a small caption, not the core numbers).
    `{__name__=~"slo:(objective|current_burn_rate|period_burn_rate|period_error_budget_remaining|time_period):.+",${selector}}`,
    refreshNonce,
  );
  const windowed = usePrometheusInstantQuery(
    slo.cluster,
    `{__name__=~"slo:sli_error:ratio_rate.+",${selector}}`,
    refreshNonce,
  );

  const objectiveRatio = metaValue(meta.samples, 'slo:objective:ratio');
  const currentBurnRate = metaValue(meta.samples, 'slo:current_burn_rate:ratio');
  const periodBurnRate = metaValue(meta.samples, 'slo:period_burn_rate:ratio');
  const budgetRemaining = metaValue(meta.samples, 'slo:period_error_budget_remaining:ratio');
  const periodDays = metaValue(meta.samples, 'slo:time_period:days');

  const errorBudgetRatio = objectiveRatio !== undefined ? 1 - objectiveRatio : undefined;
  const windowValues = new Map(
    windowed.samples.map(s => [s.metric.sloth_window, s.value] as const),
  );
  const maxWindowValue = Math.max(0.0001, ...WINDOWS.map(w => windowValues.get(w) ?? 0));

  // The actual "are we meeting the objective" answer - derived from Sloth's
  // own period_burn_rate/objective meta rules rather than a new query.
  // Sloth defines period_burn_rate = (error ratio over the compliance
  // period) / error_budget, so working backwards: periodErrorRatio =
  // period_burn_rate * error_budget, and the period's real SLI is
  // 1 - periodErrorRatio. period_burn_rate <= 1 (equivalently
  // budgetRemaining >= 0) is exactly Sloth's own definition of "within
  // budget for the full compliance window" - not a judgment call, just
  // restating the same math the burn-rate stat already uses in the more
  // direct terms this tab was missing (2026-09-13: "I don't see the current
  // SLI. do we meet the objective or not?").
  const periodErrorRatio =
    periodBurnRate !== undefined && errorBudgetRatio !== undefined ? periodBurnRate * errorBudgetRatio : undefined;
  const currentSli = periodErrorRatio !== undefined ? (1 - periodErrorRatio) * 100 : undefined;
  const meetingObjective = periodBurnRate !== undefined ? periodBurnRate <= 1 : undefined;
  const summary = humanSummary(slo, currentSli, meetingObjective, periodDays);

  const loading = meta.loading || windowed.loading;
  const anyError = meta.error ?? windowed.error;
  const noDataYet = !loading && !anyError && meta.samples.length === 0;

  return (
    <Card>
      <div className={classes.head}>
        <div>
          <SectionTitle>{slo.name}</SectionTitle>
          <Typography className={classes.sub}>
            service={slo.service} &middot; {slo.cluster}
            {slo.environmentRefName ? ` · ${slo.environmentRefName}` : ''}
          </Typography>
        </div>
        <div className={classes.headRight}>
          {meetingObjective !== undefined && (
            <StatusChip tone={meetingObjective ? 'ok' : 'bad'}>
              {meetingObjective ? 'meeting objective' : 'breaching objective'}
            </StatusChip>
          )}
          <Chip tone="sky">{slo.indicator.type}</Chip>
        </div>
      </div>

      {loading && meta.samples.length === 0 && <Progress />}
      {anyError && (
        <EmptyNote>Couldn't query Prometheus: {anyError}</EmptyNote>
      )}
      {noDataYet && (
        <EmptyNote>
          No burn-rate data yet - Sloth's generated recording rules may not have loaded into
          Prometheus yet (this can lag several minutes after an SLO is first created).
        </EmptyNote>
      )}

      {!noDataYet && !anyError && (
        <>
          {summary && <Typography className={classes.explainer}>{summary}</Typography>}
          <div className={classes.statsRow}>
            <Stat
              label="Current SLI"
              tone={verdictTone(meetingObjective)}
              value={currentSli !== undefined ? `${currentSli.toFixed(3)}%` : '—'}
              caption={periodDays !== undefined ? `over the last ${periodDays}d` : undefined}
            />
            <Stat label="Objective" value={`${slo.objective}%`} caption={periodDays !== undefined ? `${periodDays}d compliance window` : undefined} />
            <Stat
              label="Current burn rate"
              tone={burnRateTone(currentBurnRate)}
              value={currentBurnRate !== undefined ? `${currentBurnRate.toFixed(2)}×` : '—'}
              caption={periodBurnRate !== undefined ? `${periodBurnRate.toFixed(2)}× over full period` : undefined}
            />
            <div className={classes.budget}>
              <Stat
                label="Error budget remaining"
                tone={budgetTone(budgetRemaining)}
                value={budgetRemaining !== undefined ? `${(budgetRemaining * 100).toFixed(1)}%` : '—'}
              />
              <div className={classes.budgetTrack}>
                <div
                  className={classes.budgetFill}
                  style={{
                    width: `${Math.max(0, Math.min(100, (budgetRemaining ?? 0) * 100))}%`,
                    backgroundColor: toneColor(t, budgetTone(budgetRemaining)),
                  }}
                />
              </div>
            </div>
          </div>

          <ColumnLabel>SLI error ratio by window</ColumnLabel>
          <Typography className={classes.windowsCaption}>
            Each bar is the share of checks that were bad within that trailing window alone (not the
            30-day figure above) - red means that window's own error rate already exceeds the budget.
            Hover a bar for the exact number.
          </Typography>
          <div className={classes.windows}>
            {WINDOWS.map(w => {
              const v = windowValues.get(w);
              const heightPct = v !== undefined ? Math.max(2, (v / maxWindowValue) * 100) : 0;
              const overBudget = errorBudgetRatio !== undefined && v !== undefined && v > errorBudgetRatio;
              let barColor = t.sky;
              if (v === undefined) barColor = t.lineSoft;
              else if (overBudget) barColor = t.bad;
              return (
                <Tooltip key={w} title={windowTooltip(w, v, errorBudgetRatio)} arrow>
                  <div className={classes.windowBar}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                      <div
                        className={classes.windowBarFill}
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <span className={classes.windowLabel}>{w}</span>
                  </div>
                </Tooltip>
              );
            })}
          </div>

          <TextLink expanded={showDetails} onClick={() => setShowDetails(s => !s)}>
            Indicator definition
          </TextLink>
          {showDetails && (
            <div className={classes.query}>
              metric: {slo.indicator.metric}
              {'\n'}totalFilter: {slo.indicator.totalFilter}
              {slo.indicator.errorFilter ? `\nerrorFilter: ${slo.indicator.errorFilter}` : ''}
              {slo.indicator.latencyThreshold ? `\nlatencyThreshold: ${slo.indicator.latencyThreshold}s` : ''}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function SlosTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { pipelineOrder } = useReleaseContext();
  const { slos, loading, refreshing, error } = useSlos();
  const [refreshNonce, setRefreshNonce] = useState(0);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  if (slos.length === 0) {
    return (
      <div>
        <PageHeader title="SLOs" subtitle="Burn-rate views for the service level objectives each environment declares." />
        <TowerEmptyState
          title="No SLOs declared"
          description="Turn on a common SLO in an environment's Values form (Environments tab, Release sub-tab), or add an `slos:` entry to that environment's values file (airframe's slos.catalog.hangar.io XRD), to get burn-rate views here."
        />
      </div>
    );
  }

  // Group by env (2026-09-15, "I'd like to see the SLOs grouped by env...
  // there needs to be a better distinction between the environments") -
  // envOrder is sorted once so envAccentFor's index-based color assignment
  // is stable across re-renders regardless of the underlying slos array's
  // own name-first sort order (useSlos.ts).
  const envOrder = Array.from(new Set(slos.map(s => s.env ?? UNKNOWN_ENV_KEY))).sort();
  const groups = envOrder.map(env => ({
    env,
    slos: slos.filter(s => (s.env ?? UNKNOWN_ENV_KEY) === env),
  }));

  return (
    <div>
      <PageHeader
        title="SLOs"
        subtitle={`${slos.length} SLO${slos.length === 1 ? '' : 's'} across ${envOrder.length} environment${envOrder.length === 1 ? '' : 's'}${refreshing ? ' · refreshing…' : ''}`}
        actions={<RefreshButton onClick={() => setRefreshNonce(n => n + 1)} />}
      />
      {groups.map(group => {
        const tier = group.env === UNKNOWN_ENV_KEY ? 'preview' : envTierOf(group.env, pipelineOrder);
        const clusters = Array.from(new Set(group.slos.map(x => x.cluster).filter(Boolean))).join(', ');
        return (
          <Section
            key={group.env}
            className={classes.envGroup}
            title={group.env}
            meta={
              <>
                {tier !== 'preview' && <TierChip tier={tier === 'upper' ? 'flight' : 'ground'} />}
                {clusters && <Count>{clusters}</Count>}
              </>
            }
            count={`${group.slos.length} SLO${group.slos.length === 1 ? '' : 's'}`}
          >
            <div className={classes.grid}>
              {group.slos.map(slo => (
                <SloCard key={`${slo.cluster}/${slo.namespace}/${slo.name}`} slo={slo} refreshNonce={refreshNonce} />
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
