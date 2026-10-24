import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Callout, Count, EmptyNote, FilterBar, FilterChips, PageHeader, TabError, TabSkeleton, TextLink } from '../ui';
import { useReleaseContext } from '../useReleaseContext';
import { RefreshButton } from '../RefreshButton';
import { EnvPicker, type EnvPickerGroup } from '../EnvPicker';
import { envStageRank, envTierOf, health, type EnvTier } from '../types';
import { AirspaceStrips } from '../airspace/AirspaceStrips';
import { AirspaceRadar } from '../airspace/AirspaceRadar';
import { buildAppAirspace, serviceNameOf } from '../airspace/model';
import { WINDOWS, type AirspaceWindow } from '../airspace/queries';
import {
  loadAirspaceView,
  saveAirspaceView,
  useAirspaceSource,
  useAirspaceValues,
  useServiceGraph,
  type AirspaceView,
} from '../airspace/useAirspace';

// Airspace for one app (docs/airspace.md): who it talks to in one environment, observed in traces, declared in its
// values file, and owned as components. Flight Strips is the default view; Radar Scope is the same data as a graph.

const TIER_DISPLAY_ORDER: EnvTier[] = ['lower', 'upper', 'preview'];

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  links: { display: 'flex', flexWrap: 'wrap', gap: 16 },
}));

export function AirspaceTab() {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const { environments, loading, error, appName, owner, pipelineOrder, refresh, entity } = useReleaseContext();
  const [, setSearchParams] = useSearchParams();
  const [selectedEnv, setSelectedEnv] = useState<string | undefined>(undefined);
  const [win, setWin] = useState<AirspaceWindow>('1h');
  const [view, setViewState] = useState<AirspaceView>(() => loadAirspaceView());
  const [nonce, setNonce] = useState(0);
  const setView = (v: AirspaceView) => {
    setViewState(v);
    saveAirspaceView(v);
  };

  const deployed = useMemo(() => environments.filter(e => e.deployed !== false), [environments]);
  useEffect(() => {
    if (selectedEnv && deployed.some(e => e.env === selectedEnv)) return;
    setSelectedEnv(deployed[0]?.env);
  }, [deployed, selectedEnv]);

  const order = { lower: pipelineOrder.lower, upper: pipelineOrder.upper };
  const selected = deployed.find(e => e.env === selectedEnv) ?? deployed[0];
  const tier = selected ? envTierOf(selected.env, order) : undefined;
  const valuesTarget =
    selected && owner && appName && tier !== 'preview'
      ? { owner, appName, env: selected.env, tier: tier === 'upper' ? ('flight' as const) : ('ground' as const), cluster: selected.cluster }
      : undefined;
  const graphState = useServiceGraph(selected?.cluster, win, nonce);
  const graphSource = useAirspaceSource(selected?.cluster);
  const valuesState = useAirspaceValues(valuesTarget, nonce);
  const airspace = useMemo(
    () =>
      selected && appName
        ? buildAppAirspace({ app: appName, env: selected.env, graph: graphState.graph, values: valuesState.values })
        : undefined,
    [selected, appName, graphState.graph, valuesState.values],
  );

  const pickerGroups: EnvPickerGroup[] = useMemo(
    () =>
      TIER_DISPLAY_ORDER.map(tr => ({
        tier: tr,
        items: deployed
          .filter(e => envTierOf(e.env, order) === tr)
          .sort((a, b) => envStageRank(a.env, pipelineOrder.data) - envStageRank(b.env, pipelineOrder.data))
          .map(e => ({
            key: e.key,
            envName: e.env,
            cluster: e.cluster,
            health: health(e),
            active: e.env === selected?.env,
            onClick: () => setSelectedEnv(e.env),
          })),
      })).filter(g => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deployed, selected?.env, pipelineOrder],
  );

  const ns = entity?.metadata.namespace ?? 'default';
  const openApp = (app: string) => setSearchParams({ entity: `component:${ns}/${app}`, tab: 'airspace' });
  const openFleet = (sub: 'map' | 'contracts' | 'drift') =>
    setSearchParams(sub === 'contracts' && appName ? { view: 'airspace', sub, app: appName } : { view: 'airspace', sub });
  const doRefresh = () => {
    setNonce(n => n + 1);
    refresh();
  };

  const header = (
    <PageHeader
      title="Airspace"
      subtitle="Who this app talks to: seen in traces, declared in its values file, and owned as components."
      actions={<RefreshButton onClick={doRefresh} />}
    />
  );

  if (loading) return <TabSkeleton />;
  if (error) return <TabError error={error} what="the environments" onRetry={refresh} />;
  if (!selected || !airspace) {
    return (
      <div className={c.main}>
        {header}
        <EmptyNote inset>Once this app runs in an environment, its connections show here.</EmptyNote>
      </div>
    );
  }

  const self = serviceNameOf(airspace.app, airspace.env);
  const noTraces = !graphState.loading && !graphState.error && graphState.graph.samples.length === 0;
  const selfSeen = graphState.graph.samples.some(s => s.client === self || s.server === self);
  const valuesKnown = Boolean(valuesState.values);

  return (
    <div className={c.main}>
      {header}
      <EnvPicker summary={`${deployed.length} environment${deployed.length === 1 ? '' : 's'}`} groups={pickerGroups} showConnectors={false} />
      <FilterBar
        end={
          <Count>
            {airspace.inbound.length + airspace.outbound.length} connections · {airspace.owned.length} owned
          </Count>
        }
      >
        <FilterChips
          label="View"
          options={[
            { id: 'strips', label: 'Strips' },
            { id: 'radar', label: 'Radar' },
          ]}
          value={view}
          onChange={v => setView(v as AirspaceView)}
        />
        <FilterChips label="Window" options={WINDOWS.map(w => ({ id: w, label: w }))} value={win} onChange={setWin} />
      </FilterBar>

      {graphState.error && (
        <Callout
          tone="warn"
          title={
            graphSource.via === 'hub'
              ? `Couldn't read ${selected.cluster}'s service graph from the hub's Thanos`
              : `Couldn't read the service graph from ${selected.cluster}'s Prometheus`
          }
        >
          {graphState.error}. Declared and owned connections still show.
        </Callout>
      )}
      {noTraces && (
        <Callout tone="neutral" title="No traces from this cluster yet">
          The service graph comes from Tempo, fed by OpenTelemetry auto-instrumentation. A cluster without its tracing stack, or
          apps not yet rolled with the agent, shows declared and owned connections only.
        </Callout>
      )}
      {!noTraces && !graphState.loading && !selfSeen && !graphState.error && (
        <Callout tone="neutral" title={`No traffic for ${self} in the last ${win}`}>
          The app sent and received no traced requests in this window. Try a longer window.
        </Callout>
      )}
      {valuesState.error && (
        <Callout tone="neutral" title="Couldn't read this environment's values file">
          {valuesState.error}. Without it nothing can be called declared, owned or undeclared; traffic still shows.
        </Callout>
      )}
      {airspace.drift.undeclared > 0 && (
        <Callout tone="warn" label="Drift">
          {airspace.drift.undeclared} {airspace.drift.undeclared === 1 ? 'connection is' : 'connections are'} seen in traffic but not
          declared. Today the declaration is networkPolicy.allowIngressFrom / allowEgressTo in the values file, so most app-to-app
          calls start out undeclared.
        </Callout>
      )}

      {view === 'radar' ? (
        <AirspaceRadar airspace={airspace} valuesKnown={valuesKnown} onOpenApp={openApp} />
      ) : (
        <AirspaceStrips airspace={airspace} valuesKnown={valuesKnown} onOpenApp={openApp} />
      )}

      <div className={c.links}>
        <TextLink onClick={() => openFleet('contracts')}>Contracts for {appName} →</TextLink>
        <TextLink onClick={() => openFleet('map')}>Fleet map →</TextLink>
        <TextLink onClick={() => openFleet('drift')}>Fleet drift →</TextLink>
      </div>
    </div>
  );
}
