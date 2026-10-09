import { useCallback, useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import Typography from '@material-ui/core/Typography';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { triggerCatalogRefresh } from './catalogRefresh';
import type { Entity } from '@backstage/catalog-model';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { HangarMark } from './brand/HangarMark';
import { useSearchParams } from 'react-router-dom';
import { ProvisioningStrip } from './provisioning/ProvisioningStrip';
import { ProvisioningView } from './provisioning/ProvisioningView';
import { toItems, useNow } from './provisioning/shared';
import { typicalFor, useProvisioningHistory } from './provisioning/provisioningHistory';
import { useProvisioning } from './provisioning/useProvisioning';
import { CAP, deployTargetOf, hasCapabilities, isTowerService, serviceClassOf } from './serviceClass';
import { FilterBar, FilterChips, SearchField, TextLink } from './ui';

// Plain localStorage, not Backstage's own starredEntitiesApiRef
// (@backstage/plugin-catalog-react) - that API's default factory is
// registered by @backstage/plugin-catalog's own plugin.ts, and nothing in
// this app currently mounts that plugin's own routes/components, so relying
// on it here would bet this feature on wiring nobody has verified. A
// Tower-scoped key keeps this self-contained the same way every other
// per-viewer UI preference in this module already is (2026-09-12: "stared
// resources are always fixed and visible to select").
const STORAGE_KEY = 'tower.starredApps';

function loadStarred(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveStarred(starred: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...starred]));
  } catch {
    // best-effort - a private window or blocked site data just means stars
    // don't persist across reloads, not a broken picker.
  }
}

function useStarredApps() {
  const [starred, setStarred] = useState<Set<string>>(() => loadStarred());
  const toggle = useCallback((entityRef: string) => {
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(entityRef)) next.delete(entityRef);
      else next.add(entityRef);
      saveStarred(next);
      return next;
    });
  }, []);
  return { starred, toggle };
}

type ViewMode = 'cards' | 'list';
const VIEW_MODE_KEY = 'tower.viewMode';

function loadViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    return raw === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

// 'all' or a service-class id. The class chips are built from the services that
// exist, not from a fixed list, so a new kind of service gets its own chip with no
// change here.
type TypeFilter = string;
const ALL = 'all';

// How often the Services list re-reads the catalog.
export const CATALOG_REFRESH_MS = 30000;

// Cluster-backed services need a live workload to have anything to show, so they
// are listed only when Kubernetes can see them. Anything else (a function, a bucket)
// has no cluster to check and lists as soon as the catalog has it.
const isListable = (e: Entity) => !hasCapabilities(e, [CAP.k8sRuntime]) || isKubernetesAvailable(e);

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { maxWidth: 1080, margin: '0 auto' },
  eyebrow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    marginBottom: 10,
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 32,
    color: ({ t }) => t.textHi,
    marginBottom: 6,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  sub: { fontSize: 14, color: ({ t }) => t.textLo, marginBottom: 24 },
  search: { marginBottom: 20 },
  list: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: ({ t }) => t.panel,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '13px 18px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    cursor: 'pointer',
    '&:last-child': { borderBottom: 'none' },
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  name: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 15,
    color: ({ t }) => t.textHi,
  },
  meta: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textFaint },
  // The owner can be long: it shrinks and ellipsises inside the card instead of spilling out of it.
  owner: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textFaint, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty: {
    padding: '24px 18px',
    fontSize: 13,
    color: ({ t }) => t.textLo,
    fontStyle: 'italic',
  },
  rowMain: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  // Always rendered above the search box's own (filterable) list - starred
  // apps stay one click away regardless of what's typed into search
  // (2026-09-12: "stared resources are always fixed and visible to
  // select").
  starredSection: { marginBottom: 20 },
  starredLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: ({ t }) => t.textFaint,
    marginBottom: 8,
  },
  starBtn: {
    display: 'inline-flex',
    background: 'none',
    border: 'none',
    padding: 4,
    margin: -4,
    cursor: 'pointer',
    color: ({ t }) => t.textFaint,
    flexShrink: 0,
    '&:hover': { color: ({ t }) => t.amberInk },
  },
  starBtnActive: { color: ({ t }) => t.amberInk },
  tabs: {
    display: 'flex',
    gap: 2,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
    marginBottom: 20,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    cursor: 'pointer',
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 14,
    color: ({ t }) => t.textLo,
    '&:hover': { color: ({ t }) => t.textHi },
  },
  tabOn: { color: ({ t }) => t.textHi, borderBottomColor: ({ t }) => t.amber },
  tabBadge: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 600,
    padding: '1px 7px',
    borderRadius: 10,
    backgroundColor: ({ t }) => t.amber,
    color: ({ t }) => t.bg,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: ({ t }) => t.textFaint,
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 12,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 14,
    minWidth: 0,
    cursor: 'pointer',
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  cardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardDesc: {
    fontSize: 12.5,
    color: ({ t }) => t.textLo,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    minHeight: 36,
  },
  cardFoot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
  },
  typeChip: {
    display: 'inline-flex',
    flexShrink: 0,
    fontFamily: fontMono,
    fontSize: 11,
    padding: '3px 7px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo,
  },
  typeChipAi: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine },
  tableWrap: {
    overflowX: 'auto',
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    backgroundColor: ({ t }) => t.panel,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    fontFamily: fontMono,
    fontSize: 10.5,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: ({ t }) => t.textFaint,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
    whiteSpace: 'nowrap',
  },
  tr: {
    cursor: 'pointer',
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
    '&:last-child td': { borderBottom: 'none' },
  },
  td: {
    padding: '10px 12px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    verticalAlign: 'middle',
    color: ({ t }) => t.textLo,
  },
  tdDesc: {
    maxWidth: 360,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}));

/** `group:default/jfillman` shown as `jfillman`: the default namespace and the group kind are noise on a card. */
export function ownerLabel(owner: unknown): string {
  return typeof owner === 'string' ? owner.replace(/^group:default\//, '') : '';
}

export function AppPicker({
  onSelect,
  onOpenDashboard,
}: {
  onSelect: (entityRef: string) => void;
  onOpenDashboard: () => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const catalogApi = useApi(catalogApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [entities, setEntities] = useState<Entity[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const provisioning = useProvisioning();
  const now = useNow();
  const history = useProvisioningHistory();
  const provItems = useMemo(
    () => toItems(provisioning.items, now, kind => typicalFor(history.typical, kind)),
    [provisioning.items, now, history.typical],
  );
  // A finished provision is stored once; the backend ignores a repeat from another browser.
  useEffect(() => {
    provItems.forEach(i => {
      if (i.derived.complete) history.record(i);
    });
  }, [provItems, history]);
  // Built hours ago but never rolled out on the dev cluster: not "in flight", so off the strip and the badge.
  const inFlight = useMemo(() => provItems.filter(i => !i.derived.stalled), [provItems]);
  const view = searchParams.get('view') === 'provisioning' ? 'provisioning' : 'services';
  const selectedService = searchParams.get('service') ?? undefined;
  // Whether the selected service's typical bars are measured, for the legend.
  const shownItem = provItems.find(i => i.inputs.xr.name === selectedService) ?? inFlight[0] ?? provItems[0];
  const typicalMeasured = Boolean(shownItem && typicalFor(history.typical, shownItem.inputs.xr.kind));
  const openProvisioning = (name?: string) =>
    setSearchParams(name ? { view: 'provisioning', service: name } : { view: 'provisioning' });
  const openServices = () => setSearchParams({});
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(ALL);
  const [providerFilter, setProviderFilter] = useState<string>(ALL);
  const [viewMode, setViewModeState] = useState<ViewMode>(() => loadViewMode());

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    // Loaded on mount and then refreshed. It used to load once: a service that reached the catalog
    // after the page opened (new services appear in it a few minutes after their XR, on the
    // ingestor's sync) never showed up until the page was reloaded, which is exactly when someone
    // is sitting on this page waiting for the service they just created.
    const load = () =>
      catalogApi
        .getEntities({ filter: { kind: 'Component' } })
        .then(res => {
          // Same isKubernetesAvailable predicate ../glidepath already gates its
          // entity tab on: an entity with no live workload has nothing for
          // Tower's Releases/Overview/Topology/Images tabs to actually show -
          // filtering it out of the picker up front, rather than letting
          // someone select it and then hit an empty/error state, keeps
          // "single pane of glass for managing applications" honest (real
          // deployed apps, not every catalog record).
          if (cancelled) return;
          loaded = true;
          setError(undefined);
          setEntities(res.items.filter(isTowerService).filter(isListable));
        })
        .catch(e => {
          // A failed refresh must not replace a list that is already showing with an error panel.
          if (!cancelled && !loaded) setError(String(e));
        });
    load();
    const id = setInterval(load, CATALOG_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [catalogApi]);

  const { starred, toggle: toggleStarred } = useStarredApps();

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // best-effort, same as stars: the choice just won't survive a reload.
    }
  };

  // One chip per class present, most common first.
  const classChips = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; count: number }>();
    for (const e of entities ?? []) {
      const c = serviceClassOf(e);
      const chip = byId.get(c.id) ?? { id: c.id, label: c.labelPlural, count: 0 };
      chip.count += 1;
      byId.set(c.id, chip);
    }
    return [...byId.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [entities]);

  // Where services run (Kubernetes, AWS, Azure). Offered only when there is a real
  // choice to make, so a Kubernetes-only fleet looks exactly as it did.
  const providerChips = useMemo(() => {
    const byId = new Map<string, number>();
    for (const e of entities ?? []) {
      const p = deployTargetOf(e)?.provider;
      if (p) byId.set(p, (byId.get(p) ?? 0) + 1);
    }
    return byId.size > 1 ? [...byId.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];
  }, [entities]);

  const matchesFilters = useCallback(
    (e: Entity) =>
      (typeFilter === ALL || serviceClassOf(e).id === typeFilter) &&
      (providerFilter === ALL || deployTargetOf(e)?.provider === providerFilter),
    [typeFilter, providerFilter],
  );

  const filtered = useMemo(() => {
    if (!entities) return [];
    const q = query.trim().toLowerCase();
    const list = entities.filter(e => {
      if (!matchesFilters(e)) return false;
      if (!q) return true;
      return (
        e.metadata.name.toLowerCase().includes(q) ||
        (e.metadata.title ?? '').toLowerCase().includes(q) ||
        (e.metadata.description ?? '').toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  }, [entities, query, matchesFilters]);

  // Follows the workload-type filter (it scopes the whole page, so starred
  // container apps should not sit under "AI workloads") but not the text
  // search, so a starred app stays one click away while you type to find
  // something else (2026-09-12: "stared resources are always fixed and
  // visible to select"). Excluded from the list below so a starred app isn't
  // shown twice.
  const starredEntities = useMemo(
    () =>
      (entities ?? [])
        .filter(e => starred.has(stringifyEntityRef(e)) && matchesFilters(e))
        .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
    [entities, starred, matchesFilters],
  );
  const filteredMinusStarred = filtered.filter(e => !starred.has(stringifyEntityRef(e)));

  if (error) return <ResponseErrorPanel error={new Error(error)} />;

  const activate = (ref: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onSelect(ref),
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        onSelect(ref);
      }
    },
  });

  const renderStar = (ref: string) => {
    const isStarred = starred.has(ref);
    return (
      <button
        type="button"
        className={`${classes.starBtn} ${isStarred ? classes.starBtnActive : ''}`}
        title={isStarred ? 'Unstar' : 'Star'}
        aria-pressed={isStarred}
        aria-label={`${isStarred ? 'Unstar' : 'Star'} ${ref}`}
        onClick={ev => {
          ev.stopPropagation();
          toggleStarred(ref);
        }}
      >
        {isStarred ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
      </button>
    );
  };

  const renderTypeChip = (e: Entity) => {
    const cls = serviceClassOf(e);
    const target = deployTargetOf(e);
    return (
      <span className={`${classes.typeChip} ${cls.id === 'ai-workload' ? classes.typeChipAi : ''}`}>
        {cls.label}
        {target && target.id !== 'k8s-rollout' ? ` · ${target.label}` : ''}
      </span>
    );
  };

  const renderCard = (e: Entity) => {
    const ref = stringifyEntityRef(e);
    return (
      <div key={ref} className={classes.card} {...activate(ref)}>
        <div className={classes.cardTop}>
          <div className={classes.name}>{e.metadata.title ?? e.metadata.name}</div>
          {renderStar(ref)}
        </div>
        <div className={classes.cardDesc}>{e.metadata.description}</div>
        <div className={classes.cardFoot}>
          {renderTypeChip(e)}
          <span className={classes.owner} title={e.spec?.owner as string | undefined}>
            {ownerLabel(e.spec?.owner)}
          </span>
        </div>
      </div>
    );
  };

  const renderTable = (list: Entity[]) => (
    <div className={classes.tableWrap}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th className={classes.th} style={{ width: 40 }} aria-label="Starred" />
            <th className={classes.th}>Service</th>
            <th className={classes.th}>Type</th>
            <th className={classes.th}>Owner</th>
            <th className={classes.th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {list.map(e => {
            const ref = stringifyEntityRef(e);
            return (
              <tr key={ref} className={classes.tr} {...activate(ref)}>
                <td className={classes.td}>{renderStar(ref)}</td>
                <td className={classes.td}>
                  <span className={classes.name}>{e.metadata.title ?? e.metadata.name}</span>
                </td>
                <td className={classes.td}>{renderTypeChip(e)}</td>
                <td className={`${classes.td} ${classes.meta}`} title={e.spec?.owner as string | undefined}>
                  {ownerLabel(e.spec?.owner)}
                </td>
                <td className={`${classes.td} ${classes.tdDesc}`}>{e.metadata.description}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  let emptyMessage = 'Every match is already starred above.';
  if (filtered.length === 0) {
    if (query.trim()) emptyMessage = `No services match "${query}".`;
    else if (typeFilter === ALL && providerFilter === ALL) emptyMessage = 'No services yet.';
    else emptyMessage = 'No services match these filters.';
  }

  const renderCollection = (list: Entity[]) =>
    viewMode === 'cards' ? <div className={classes.cards}>{list.map(renderCard)}</div> : renderTable(list);

  return (
    <div className={classes.wrap}>
      <Typography className={classes.eyebrow}>
        <HangarMark glyph="tower" size={16} />
        Tower
      </Typography>
      <div className={classes.titleRow}>
        <Typography className={classes.title}>Services</Typography>
        <TextLink onClick={onOpenDashboard}>Fleet Dashboard →</TextLink>
      </div>
      <Typography className={classes.sub}>Everything running on Hangar. Select a service to open its tabs.</Typography>
      <div className={classes.tabs} role="tablist" aria-label="Services sections">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'services'}
          className={`${classes.tab} ${view === 'services' ? classes.tabOn : ''}`}
          onClick={openServices}
        >
          Services
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'provisioning'}
          className={`${classes.tab} ${view === 'provisioning' ? classes.tabOn : ''}`}
          onClick={() => openProvisioning()}
        >
          Provisioning
          {inFlight.length > 0 && <span className={classes.tabBadge}>{inFlight.length}</span>}
        </button>
      </div>
      {view === 'provisioning' ? (
        <ProvisioningView
          items={provItems}
          selected={selectedService}
          onSelect={openProvisioning}
          error={provisioning.error}
          loading={provisioning.loading}
          onRefreshCatalog={() => triggerCatalogRefresh(discoveryApi, fetchApi)}
          runs={history.runs}
          typicalMeasured={typicalMeasured}
        />
      ) : (
        <>
          <ProvisioningStrip items={inFlight} onOpen={openProvisioning} />
          <FilterBar>
            <FilterChips
              label="Type"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[{ id: ALL, label: 'All', count: entities?.length }, ...classChips].map(f => ({
                id: f.id,
                label: f.label,
                count: entities ? f.count : undefined,
              }))}
            />
            {providerChips.length > 0 && (
              <FilterChips
                label="Runs on"
                value={providerFilter}
                onChange={setProviderFilter}
                options={[[ALL, entities?.length ?? 0] as [string, number], ...providerChips].map(([id, count]) => ({
                  id,
                  label: id === ALL ? 'Anywhere' : id,
                  count,
                }))}
              />
            )}
            <SearchField label="Search services" placeholder="Search services…" value={query} onChange={setQuery} />
          </FilterBar>
          {!entities ? (
            <Progress />
          ) : (
            <>
              {starredEntities.length > 0 && (
                <div className={classes.starredSection}>
                  <div className={classes.starredLabel}>Starred</div>
                  {renderCollection(starredEntities)}
                </div>
              )}
              <div className={classes.sectionHead}>
                <span className={classes.sectionLabel}>All services · {filteredMinusStarred.length}</span>
                <FilterChips
                  label="View"
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { id: 'cards', label: 'Cards' },
                    { id: 'list', label: 'List' },
                  ]}
                />
              </div>
              {filteredMinusStarred.length === 0 ? (
                <div className={classes.list}>
                  <div className={classes.empty}>{emptyMessage}</div>
                </div>
              ) : (
                renderCollection(filteredMinusStarred)
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
