import { useCallback, useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
import InputAdornment from '@material-ui/core/InputAdornment';
import SearchIcon from '@material-ui/icons/Search';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import Typography from '@material-ui/core/Typography';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';
import { useApi } from '@backstage/core-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { HangarMark } from '../brand/HangarMark';

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

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { maxWidth: 720, margin: '0 auto' },
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
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 32, color: ({ t }) => t.textHi, marginBottom: 6 },
  titleRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  dashboardLink: {
    fontFamily: fontMono,
    fontSize: 12,
    letterSpacing: '0.03em',
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    '&:hover': { textDecoration: 'underline' },
  },
  sub: { fontSize: 14, color: ({ t }) => t.textLo, marginBottom: 24 },
  search: { marginBottom: 20 },
  list: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 5, overflow: 'hidden', backgroundColor: ({ t }) => t.panel },
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
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 15, color: ({ t }) => t.textHi },
  meta: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textFaint },
  empty: { padding: '24px 18px', fontSize: 13, color: ({ t }) => t.textLo, fontStyle: 'italic' },
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
}));

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
  const [entities, setEntities] = useState<Entity[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
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
        if (!cancelled) setEntities(res.items.filter(isKubernetesAvailable));
      })
      .catch(e => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [catalogApi]);

  const { starred, toggle: toggleStarred } = useStarredApps();

  const filtered = useMemo(() => {
    if (!entities) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? entities.filter(
          e =>
            e.metadata.name.toLowerCase().includes(q) ||
            (e.metadata.title ?? '').toLowerCase().includes(q) ||
            (e.metadata.description ?? '').toLowerCase().includes(q),
        )
      : entities;
    return [...list].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  }, [entities, query]);

  // Independent of `query`/`filtered` - stays visible and selectable no
  // matter what's typed into search (2026-09-12: "stared resources are
  // always fixed and visible to select"). Excluded from the list below so a
  // starred app isn't shown twice.
  const starredEntities = useMemo(
    () =>
      (entities ?? [])
        .filter(e => starred.has(stringifyEntityRef(e)))
        .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
    [entities, starred],
  );
  const filteredMinusStarred = filtered.filter(e => !starred.has(stringifyEntityRef(e)));

  if (error) return <ResponseErrorPanel error={new Error(error)} />;

  const renderRow = (e: Entity) => {
    const ref = stringifyEntityRef(e);
    const isStarred = starred.has(ref);
    return (
      <div
        key={ref}
        className={classes.row}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(ref)}
        onKeyDown={ev => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            onSelect(ref);
          }
        }}
      >
        <div className={classes.rowMain}>
          <button
            type="button"
            className={`${classes.starBtn} ${isStarred ? classes.starBtnActive : ''}`}
            title={isStarred ? 'Unstar' : 'Star'}
            onClick={ev => {
              ev.stopPropagation();
              toggleStarred(ref);
            }}
          >
            {isStarred ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
          </button>
          <div>
            <div className={classes.name}>{e.metadata.title ?? e.metadata.name}</div>
            {e.metadata.description && <div className={classes.meta}>{e.metadata.description}</div>}
          </div>
        </div>
        <div className={classes.meta}>{e.spec?.owner as string | undefined}</div>
      </div>
    );
  };

  return (
    <div className={classes.wrap}>
      <Typography className={classes.eyebrow}>
        <HangarMark glyph="tower" size={16} />
        Tower
      </Typography>
      <div className={classes.titleRow}>
        <Typography className={classes.title}>Choose an application</Typography>
        <button className={classes.dashboardLink} onClick={onOpenDashboard} type="button">
          Fleet Dashboard →
        </button>
      </div>
      <Typography className={classes.sub}>
        Releases, topology, pull requests, images, config and SLOs for one app, all in one place.
      </Typography>
      <TextField
        className={classes.search}
        fullWidth
        variant="outlined"
        size="small"
        placeholder="Search applications…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" style={{ color: t.textFaint }} />
            </InputAdornment>
          ),
        }}
      />
      {!entities ? (
        <Progress />
      ) : (
        <>
          {starredEntities.length > 0 && (
            <div className={classes.starredSection}>
              <div className={classes.starredLabel}>Starred</div>
              <div className={classes.list}>{starredEntities.map(renderRow)}</div>
            </div>
          )}
          <div className={classes.list}>
            {filteredMinusStarred.length === 0 ? (
              <div className={classes.empty}>
                {filtered.length === 0
                  ? `No applications match "${query}".`
                  : 'Every match is already starred above.'}
              </div>
            ) : (
              filteredMinusStarred.map(renderRow)
            )}
          </div>
        </>
      )}
    </div>
  );
}
