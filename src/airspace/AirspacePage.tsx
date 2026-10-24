import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useHangarTokens, type HangarTokens } from '../brand/tokens';
import { HangarMark } from '../brand/HangarMark';
import { Callout, FilterBar, FilterChips, FilterSelect, PageHeader, Subtabs, TextLink } from '../ui';
import { RefreshButton } from '../RefreshButton';
import { usePlatformConfig } from '../platformConfig';
import { useRegisteredClusters } from '../environments/registeredClusters';
import { WINDOWS, airspaceClusters, type AirspaceWindow } from './queries';
import { useAirspaceSource, useServiceGraph } from './useAirspace';
import { useHangarApps } from './useHangarApps';
import { MapView } from './MapView';
import { ContractsView } from './ContractsView';
import { DriftView } from './DriftView';

// Fleet Airspace (?view=airspace): the whole fleet's connections on one cluster, beside the dashboards. Map is the
// graph, Contracts the catalog's APIs, Drift what is seen but not declared. Each app's own Airspace tab links here.

type Sub = 'map' | 'contracts' | 'drift';
const SUBS: Array<{ id: Sub; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'drift', label: 'Drift' },
];

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10 },
}));

export function AirspacePage({ onBack }: { onBack: () => void }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const [searchParams, setSearchParams] = useSearchParams();
  const sub = (SUBS.find(s => s.id === searchParams.get('sub'))?.id ?? 'map') as Sub;
  const appFilter = searchParams.get('app') ?? undefined;
  const platform = usePlatformConfig();
  const registry = useRegisteredClusters();
  const clusters = useMemo(
    () =>
      airspaceClusters(
        registry.status === 'ready' ? registry.clusters.map(r => r.name) : undefined,
        platform.controlPlaneCluster,
        Object.keys(platform.clusters),
      ),
    [platform, registry],
  );
  const [cluster, setCluster] = useState<string>(() => searchParams.get('cluster') ?? platform.controlPlaneCluster ?? '');
  const source = useAirspaceSource(cluster);
  useEffect(() => {
    if (!cluster && clusters[0]) setCluster(clusters[0]);
  }, [cluster, clusters]);
  const [win, setWin] = useState<AirspaceWindow>('1h');
  const [nonce, setNonce] = useState(0);
  const graph = useServiceGraph(cluster || undefined, win, nonce);
  const apps = useHangarApps();
  const appNames = useMemo(() => apps.apps.map(a => a.app), [apps.apps]);

  // The envs on this cluster: a service name is `<app>-<env>` for a catalog app.
  const envs = useMemo(() => {
    const out = new Set<string>();
    for (const s of graph.graph.samples) {
      for (const svc of [s.client, s.server]) {
        const app = appNames.filter(a => svc.startsWith(`${a}-`)).sort((a, b) => b.length - a.length)[0];
        if (app && svc.length > app.length + 1) out.add(svc.slice(app.length + 1));
      }
    }
    return [...out].sort();
  }, [graph.graph.samples, appNames]);
  const [envChoice, setEnvChoice] = useState<string | undefined>(() => searchParams.get('env') ?? undefined);
  const env = envChoice && envs.includes(envChoice) ? envChoice : envs[0] ?? envChoice ?? '';

  const setSub = (s: Sub) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', 'airspace');
    next.set('sub', s);
    if (s !== 'contracts') next.delete('app');
    setSearchParams(next);
  };
  const openApp = (app: string) => {
    const ref = apps.apps.find(a => a.app === app)?.ref;
    if (ref) setSearchParams({ entity: ref, tab: 'airspace' });
  };

  return (
    <div className={c.root}>
      <TextLink onClick={onBack}>← All services</TextLink>
      <div className={c.brandRow}>
        <HangarMark glyph="tower" size={22} />
        <PageHeader
          title="Airspace"
          subtitle="Who talks to whom across the fleet, the APIs they publish, and what is seen but not declared."
          actions={<RefreshButton onClick={() => setNonce(n => n + 1)} />}
        />
      </div>
      <Subtabs label="Airspace views" tabs={SUBS} value={sub} onChange={setSub} />
      <FilterBar>
        {clusters.length > 1 && (
          <FilterChips label="Cluster" options={clusters.map(x => ({ id: x, label: x }))} value={cluster} onChange={setCluster} />
        )}
        {envs.length > 0 && (
          <FilterSelect label="Environment" value={env} options={envs.map(e => ({ value: e, label: e }))} onChange={setEnvChoice} />
        )}
        <FilterChips label="Window" options={WINDOWS.map(w => ({ id: w, label: w }))} value={win} onChange={setWin} />
      </FilterBar>
      {graph.error && (
        <Callout
          tone="warn"
          title={source.via === 'hub' ? `Couldn't read ${cluster}'s service graph from the hub's Thanos` : `Couldn't read the service graph from ${cluster}'s Prometheus`}
        >
          {graph.error}
        </Callout>
      )}
      {apps.error && (
        <Callout tone="bad" title="Couldn't read the catalog's services">
          {apps.error}
        </Callout>
      )}
      {sub === 'map' && <MapView graph={graph.graph} env={env} knownApps={appNames} onOpenApp={openApp} />}
      {sub === 'contracts' && (
        <ContractsView
          graph={graph.graph}
          cluster={cluster}
          env={env}
          win={win}
          appFilter={appFilter}
          compareTo={searchParams.get('compare') ?? undefined}
          roster={apps.entities}
          nonce={nonce}
          onOpenApp={openApp}
        />
      )}
      {sub === 'drift' && <DriftView graph={graph.graph} env={env} cluster={cluster} apps={apps.apps} nonce={nonce} onOpenApp={openApp} />}
    </div>
  );
}
