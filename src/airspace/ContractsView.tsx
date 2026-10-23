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
import { refName, type ApiContract } from './contracts';
import { appOfService, formatRate, serviceNameOf, type ServiceGraph } from './model';
import { useApiContracts } from './useHangarApps';
import { useObservedOperations } from './useAirspace';
import type { AirspaceWindow } from './queries';

// Contracts: the fleet's APIs, from the catalog's API entities. What phase 1 can say honestly: the registered
// definition, who provides and consumes it (catalog relations) and who calls the provider (traces). The spec each
// environment actually runs, its diff and the breaking-change gate are phase 2 (docs/airspace.md).

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
  onOpenApp,
}: {
  graph: ServiceGraph;
  cluster: string;
  env: string;
  win: AirspaceWindow;
  /** ?app=: show this app's APIs (a deep link from its Airspace tab). */
  appFilter?: string;
  onOpenApp: (app: string) => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const { loading, error, contracts } = useApiContracts();
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedRef, setSelectedRef] = useState<string | undefined>(undefined);

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
    if (!shown.some(x => x.ref === selectedRef)) setSelectedRef(shown[0]?.ref);
  }, [shown, selectedRef]);
  const selected = shown.find(x => x.ref === selectedRef);

  if (loading) return <PanelSkeleton label="Loading APIs" />;
  if (error) return <Callout tone="bad" title="Couldn't read the catalog's APIs">{error}</Callout>;

  if (contracts.length === 0) {
    return (
      <div className={c.detailCol}>
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
                      if (e.key === 'Enter' || e.key === ' ') setSelectedRef(x.ref);
                    }}
                    className={`${tk.rowLink} ${x.ref === selected?.ref ? tk.rowSelected : ''}`}
                    onClick={() => setSelectedRef(x.ref)}
                  >
                    <td className={tk.td}>
                      <span className={c.apiName}>{x.title}</span>
                      {x.subtitle && <span className={c.apiSub}>{x.subtitle}</span>}
                    </td>
                    <td className={tk.td}>
                      <Chip>{x.type}</Chip>
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
        {selected && <ContractDetail contract={selected} graph={graph} cluster={cluster} env={env} win={win} onOpenApp={onOpenApp} />}
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
  onOpenApp,
}: {
  contract: ApiContract;
  graph: ServiceGraph;
  cluster: string;
  env: string;
  win: AirspaceWindow;
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

      <Callout tone="neutral" label="Phase 2">
        The spec each environment runs, the diff between them and the breaking-change gate on promotion are not available yet:
        they need Glidepath to extract the spec from each signed image. This shows the definition registered in the catalog.
      </Callout>

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
