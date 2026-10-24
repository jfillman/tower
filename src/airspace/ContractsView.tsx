import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, fontScale, useHangarTokens, type HangarTokens } from '../brand/tokens';
import {
  Callout,
  Card,
  Chip,
  Count,
  EmptyNote,
  Fact,
  FactGrid,
  FilterBar,
  FilterChips,
  Hint,
  PanelSkeleton,
  SearchField,
  Section,
  StatusChip,
  TextLink,
  YamlBlock,
  useTableKit,
} from '../ui';
import type { Entity } from '@backstage/catalog-model';
import { useFleetEnvironments } from '../useFleetEnvironments';
import { refName, withDeployedSpecs, type ApiContract } from './contracts';
import { appOfService, formatRate, serviceNameOf, type ServiceGraph } from './model';
import { useApiContracts } from './useHangarApps';
import { useObservedOperations } from './useAirspace';
import { useDeployedSpecs } from './useDeployedSpecs';
import { DeployedSpecsPanel, NoDeployedSpec } from './DeployedSpecsPanel';
import type { AirspaceWindow } from './queries';

// Contracts: the fleet's APIs. The catalog's API entities (the registered definition, who provides and consumes it)
// and, phase 2, the spec each environment actually runs: Glidepath signs it onto every image, and Tower reads it from the
// image each environment's Rollout runs (useDeployedSpecs). Who calls the provider comes from traces.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  layout: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  listCol: { flex: '1 1 320px', minWidth: 0, maxWidth: 420 },
  detailCol: { flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  method: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.sky },
  path: { fontFamily: fontMono, fontSize: fontScale.md, color: ({ t }) => t.textHi },
  deprecatedPath: { textDecoration: 'line-through', color: ({ t }) => t.textFaint },
  peers: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  scrollBox: { overflowX: 'auto' },
  filterPad: { padding: '10px 14px 0' },
  apiName: { display: 'block', fontFamily: fontMono, fontSize: fontScale.md, color: ({ t }) => t.textHi },
  apiSub: { display: 'block', fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.textLo, marginTop: 2 },
}));

const EXAMPLE = `# catalog-info.yaml in the app's repo, beside its Component
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: flight-api
  description: Flights, seats and status
spec:
  type: openapi          # openapi | asyncapi | graphql | grpc
  lifecycle: production
  owner: team-flight-data
  definition:
    $text: ./openapi.yaml
---
# and on the Component:
spec:
  providesApis: [flight-api]
  consumesApis: [baggage-api]   # on a caller's Component
`;

export function ContractsView({
  graph,
  cluster,
  env,
  win,
  appFilter,
  compareTo,
  roster,
  nonce,
  onOpenApp,
}: {
  graph: ServiceGraph;
  cluster: string;
  env: string;
  win: AirspaceWindow;
  /** ?app=: show this app's APIs (a deep link from its Airspace tab or a Release Record). */
  appFilter?: string;
  /** ?compare=<env>: open the deployed-spec diff with this environment as the newer side. */
  compareTo?: string;
  /** Tower's services, whose environments' images are read for signed specs. */
  roster: Entity[];
  nonce: number;
  onOpenApp: (app: string) => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const catalog = useApiContracts(nonce);
  const scoped = useMemo(
    () =>
      appFilter
        ? roster.filter(e => (e.metadata.annotations?.['github.com/project-slug']?.split('/')[1] ?? e.metadata.name) === appFilter)
        : roster,
    [roster, appFilter],
  );
  const fleet = useFleetEnvironments(scoped);
  const deployed = useDeployedSpecs(fleet.apps, nonce);
  const contracts = useMemo(() => withDeployedSpecs(catalog.contracts, deployed.byApp), [catalog.contracts, deployed.byApp]);
  const { loading, error } = catalog;
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedRef, setSelectedRef] = useState<string | undefined>(undefined);
  // Until someone picks an API, follow the top of the list: deployed specs arrive after the catalog, and the app's own
  // API should then be what opens, not the platform XRD that happened to be first a moment earlier.
  const [picked, setPicked] = useState(false);
  const pick = (ref: string) => {
    setPicked(true);
    setSelectedRef(ref);
  };

  const types = useMemo(() => [...new Set(contracts.map(x => x.type))].sort(), [contracts]);
  const shown = useMemo(
    () =>
      contracts.filter(
        x =>
          (type === 'all' || x.type === type) &&
          (!appFilter || x.providers.some(p => refName(p) === appFilter) || x.consumers.some(p => refName(p) === appFilter)) &&
          (!query || `${x.title} ${x.name} ${x.description ?? ''}`.toLowerCase().includes(query.toLowerCase())),
      ),
    [contracts, type, appFilter, query],
  );
  useEffect(() => {
    if (!picked || !shown.some(x => x.ref === selectedRef)) setSelectedRef(shown[0]?.ref);
  }, [shown, selectedRef, picked]);
  const selected = shown.find(x => x.ref === selectedRef);

  // The probes run each service's environment hooks (they render nothing); every branch below mounts them.
  if (loading) return <>{fleet.probes}<PanelSkeleton label="Loading APIs" /></>;
  if (error) return <>{fleet.probes}<Callout tone="bad" title="Couldn't read the catalog's APIs">{error}</Callout></>;

  if (contracts.length === 0) {
    return (
      <div className={c.detailCol}>
        {fleet.probes}
        {deployed.loading && <Hint>Reading each environment's image for a signed spec…</Hint>}
        <Callout tone="neutral" title="No APIs registered in the catalog yet">
          Contracts lists the catalog's API entities. None exist yet: an app registers its API next to its Component, with the
          definition kept in the app's repo. Once one does, its operations, providers and consumers show here.
        </Callout>
        <YamlBlock title="Registering an API" text={EXAMPLE} lineNumbers={false} />
        {appFilter && <ObservedOperations cluster={cluster} service={serviceNameOf(appFilter, env)} win={win} />}
      </div>
    );
  }

  return (
    <div className={c.layout}>
      {fleet.probes}
      <div className={c.listCol}>
        <Section title="APIs" count={shown.length} framed>
          <div className={c.filterPad}>
            <FilterBar>
              <FilterChips label="Type" options={[{ id: 'all', label: 'All' }, ...types.map(x => ({ id: x, label: x }))]} value={type} onChange={setType} />
              <SearchField label="Search APIs" placeholder="name or description" value={query} onChange={setQuery} />
            </FilterBar>
          </div>
          {appFilter && (
            <Hint inset>
              APIs {appFilter} provides or consumes. <TextLink onClick={() => onOpenApp(appFilter)}>{appFilter}'s Airspace →</TextLink>
            </Hint>
          )}
          {shown.length === 0 ? (
            <EmptyNote inset>No API matches.</EmptyNote>
          ) : (
            <table className={tk.table}>
              <tbody>
                {shown.map(x => (
                  <tr
                    key={x.ref}
                    tabIndex={0}
                    aria-selected={x.ref === selected?.ref}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') pick(x.ref);
                    }}
                    className={`${tk.rowLink} ${x.ref === selected?.ref ? tk.rowSelected : ''}`}
                    onClick={() => pick(x.ref)}
                  >
                    <td className={tk.td}>
                      <span className={c.apiName}>{x.title}</span>
                      {x.subtitle && <span className={c.apiSub}>{x.subtitle}</span>}
                    </td>
                    <td className={tk.td}>
                      <Chip>{x.type}</Chip>
                      {x.deployed && (
                        <>
                          {' '}
                          <StatusChip tone="info" title="Each environment's image carries a signed spec">
                            signed
                          </StatusChip>
                        </>
                      )}
                    </td>
                    <td className={tk.td}>
                      <Count>{x.operations.length || '—'}</Count>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
      <div className={c.detailCol}>
        {!selected && appFilter && (
          <>
            <Callout tone="neutral" title={`No registered API for ${appFilter}`}>
              Nothing in the catalog says {appFilter} provides or consumes an API. What it served in traffic is below.
            </Callout>
            <ObservedOperations cluster={cluster} service={serviceNameOf(appFilter, env)} win={win} />
          </>
        )}
        {selected && appFilter && !selected.providers.some(p => refName(p) === appFilter) && (
          <ObservedOperations cluster={cluster} service={serviceNameOf(appFilter, env)} win={win} />
        )}
        {selected && (
          <ContractDetail contract={selected} graph={graph} cluster={cluster} env={env} win={win} compareTo={compareTo} onOpenApp={onOpenApp} />
        )}
      </div>
    </div>
  );
}

function ContractDetail({
  contract,
  graph,
  cluster,
  env,
  win,
  compareTo,
  onOpenApp,
}: {
  contract: ApiContract;
  graph: ServiceGraph;
  cluster: string;
  env: string;
  win: AirspaceWindow;
  compareTo?: string;
  onOpenApp: (app: string) => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const [showDef, setShowDef] = useState(false);
  const providers = contract.providers.map(refName);
  // Who called a provider in this env, from the service graph: the catalog's consumers are declared, these are seen.
  const callers = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of providers) {
      const svc = serviceNameOf(p, env);
      for (const s of graph.samples) {
        if (s.server !== svc || s.client === 'user') continue;
        const who = appOfService(s.client, env) ?? s.client;
        out.set(who, (out.get(who) ?? 0) + s.rate);
      }
    }
    return [...out.entries()].sort((a, b) => b[1] - a[1]);
  }, [providers, graph, env]);
  const declaredConsumers = contract.consumers.map(refName);

  return (
    <>
      <Card title={contract.title} meta={<><Chip>{contract.type}</Chip>{contract.subtitle && <Count>{contract.subtitle}</Count>}</>} actions={contract.lifecycle ? <StatusChip tone="neutral">{contract.lifecycle}</StatusChip> : undefined}>
        {contract.description && <Hint>{contract.description}</Hint>}
        <FactGrid>
          <Fact label="Owner">{contract.owner ?? '—'}</Fact>
          <Fact label="Provided by">
            <span className={c.peers}>
              {providers.length ? providers.map(p => <TextLink key={p} onClick={() => onOpenApp(p)}>{p}</TextLink>) : '—'}
            </span>
          </Fact>
          <Fact label="Declared consumers">
            <span className={c.peers}>{declaredConsumers.length ? declaredConsumers.join(', ') : 'none'}</span>
          </Fact>
          <Fact label={`Callers seen in ${env}`}>
            <span className={c.peers}>
              {callers.length
                ? callers.map(([who, rate]) => (
                    <StatusChip key={who} tone={declaredConsumers.includes(who) ? 'ok' : 'warn'} title={declaredConsumers.includes(who) ? 'declared consumer' : 'calls the provider, not a declared consumer'}>
                      {who} · {formatRate(rate)}
                    </StatusChip>
                  ))
                : 'none in this window'}
            </span>
          </Fact>
        </FactGrid>
      </Card>

      {contract.source === 'deployed' && (
        <Hint>Read from the spec signed onto the app's images; there is no API entity for it in the catalog.</Hint>
      )}
      {contract.deployed ? (
        <DeployedSpecsPanel app={contract.deployed.app} envs={contract.deployed.envs} win={win} compareTo={compareTo} />
      ) : (
        providers[0] && (contract.type === 'openapi' || contract.type === 'asyncapi') && <NoDeployedSpec app={providers[0]} />
      )}

      {/* A deployed-only API's operations are its environments' specs, listed above per environment. */}
      {contract.source === 'catalog' && (
        <>
      <Section title="Operations" count={contract.operations.length} framed>
        {contract.parseError && <Hint inset>Couldn't read the definition as OpenAPI: {contract.parseError}</Hint>}
        {!contract.parseError && contract.type !== 'openapi' && (
          <Hint inset>
            {contract.type === 'crd'
              ? 'An Airframe XRD: its contract is the schema in the definition below, not HTTP operations.'
              : `Operations are listed for OpenAPI definitions; this is ${contract.type}. The definition is below.`}
          </Hint>
        )}
        {contract.operations.length > 0 && (
          <div className={c.scrollBox}>
            <table className={tk.table}>
              <thead>
                <tr>
                  <th className={tk.th}>Method</th>
                  <th className={tk.th}>Path</th>
                  <th className={tk.th}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {contract.operations.map(o => (
                  <tr key={`${o.method} ${o.path}`}>
                    <td className={tk.td}>
                      <span className={c.method}>{o.method}</span>
                    </td>
                    <td className={tk.td}>
                      <span className={`${c.path} ${o.deprecated ? c.deprecatedPath : ''}`}>{o.path}</span>
                    </td>
                    <td className={tk.td}>{o.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
        </>
      )}

      {providers[0] && <ObservedOperations cluster={cluster} service={serviceNameOf(providers[0], env)} win={win} />}

      <TextLink expanded={showDef} onClick={() => setShowDef(v => !v)}>
        Definition
      </TextLink>
      {showDef && <YamlBlock title={`${contract.name} definition`} text={contract.definition || '# empty'} filter />}
    </>
  );
}

/** Operations a service served, from span metrics: what was seen, not what the contract promises. */
function ObservedOperations({ cluster, service, win }: { cluster: string; service: string; win: AirspaceWindow }) {
  const tk = useTableKit();
  const ops = useObservedOperations(cluster, service, win);
  return (
    <Section title={`Operations seen in traffic · ${service}`} count={ops.operations.length} framed>
      <Hint inset>Span names from traces in the last {win}: what was served, not a contract. Frameworks that do not report a route show only the method.</Hint>
      {ops.operations.length === 0 ? (
        <EmptyNote inset>{ops.loading ? 'Loading…' : 'None in this window.'}</EmptyNote>
      ) : (
        <table className={tk.table}>
          <thead>
            <tr>
              <th className={tk.th}>Operation</th>
              <th className={tk.th}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {ops.operations.map(o => (
              <tr key={o.name}>
                <td className={tk.td}>{o.name}</td>
                <td className={tk.td}>{formatRate(o.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
