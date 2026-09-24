import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import type { K8sResourceRef } from './types';

// Backs items 2/3/7 of the Topology-tab feature request (2026-09-08): "click
// through and see the full resource list", "view the raw yaml of each
// resource", "labels and annotations", plus the follow-up feedback (2026-
// 09-09) asking for the YAML view's fields to be collapsible. Every
// K8sResourceRef already carries the exact object the Kubernetes API
// returned (useTowerEnvironments) - this file is purely presentation, no
// new fetches.
//
// Secret redaction is the one deliberate exception to "show the real
// object": a Secret's `data`/`stringData` values are base64 (trivially
// reversible) or plaintext credentials respectively - dumping them into a
// YAML view would be the same mistake as pasting a token into chat (see
// feedback_credential_handling memory). Redacted at render time, never in
// the fetched data itself, so nothing here changes what other Tower features
// see - only what this one view is willing to print.
function redactIfSecret(ref: K8sResourceRef): unknown {
  if (ref.kind !== 'Secret' || !ref.raw || typeof ref.raw !== 'object') return ref.raw;
  const secret = ref.raw as { data?: Record<string, unknown>; stringData?: Record<string, unknown> };
  const redact = (rec?: Record<string, unknown>) =>
    rec ? Object.fromEntries(Object.keys(rec).map(k => [k, '<redacted>'])) : undefined;
  return { ...secret, data: redact(secret.data), stringData: redact(secret.stringData) };
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  head: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  kind: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '2px 8px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky,
  },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: ({ t }) => t.textFaint,
    marginBottom: 6,
    marginTop: 14,
  },
  secretNote: { fontSize: 11.5, fontStyle: 'italic', color: ({ t }) => t.textFaint, marginBottom: 10, marginTop: 0 },
  // One row per label/annotation, key and value in the same line of text
  // (not stacked on separate lines - too much wasted vertical space for the
  // common case of a short value, 2026-09-09 feedback) - a short value sits
  // right after its key like "app: backstage"; a long one (e.g. kubectl.
  // kubernetes.io/last-applied-configuration's full JSON blob) just wraps
  // onto following lines the way a paragraph would, still full-width rather
  // than squeezed into a grid column.
  kvList: { display: 'flex', flexDirection: 'column', gap: 5 },
  kv: { minWidth: 0, fontSize: 11.5, lineHeight: 1.5, overflowWrap: 'anywhere' },
  kvKey: { fontFamily: fontMono, color: ({ t }) => t.textFaint },
  kvVal: { fontFamily: fontMono, color: ({ t }) => t.textHi, whiteSpace: 'pre-wrap' },
  none: { fontSize: 12, fontStyle: 'italic', color: ({ t }) => t.textFaint },
  tree: {
    padding: '10px 12px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
    maxHeight: 460,
    overflow: 'auto',
  },
}));

function KvList({
  title,
  data,
  classes,
}: {
  title: string;
  data: Record<string, string> | undefined;
  classes: ReturnType<typeof useStyles>;
}) {
  const entries = Object.entries(data ?? {});
  return (
    <>
      <Typography className={classes.sectionLabel}>{title}</Typography>
      {entries.length === 0 ? (
        <Typography className={classes.none}>none</Typography>
      ) : (
        <div className={classes.kvList}>
          {entries.map(([k, v]) => (
            <div key={k} className={classes.kv}>
              <span className={classes.kvKey}>{k}: </span>
              <span className={classes.kvVal}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const useTreeStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  row: { display: 'flex', alignItems: 'flex-start', gap: 4 },
  toggle: {
    width: 14,
    flexShrink: 0,
    color: ({ t }) => t.textFaint,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: fontMono,
    fontSize: 10,
    padding: '2px 0 0',
    textAlign: 'left',
  },
  toggleSpacer: { width: 14, flexShrink: 0 },
  key: { color: ({ t }) => t.sky, flexShrink: 0 },
  punct: { color: ({ t }) => t.textFaint },
  scalar: { color: ({ t }) => t.textHi, overflowWrap: 'anywhere' },
  placeholder: {
    color: ({ t }) => t.textFaint,
    fontStyle: 'italic',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
  },
  children: { marginLeft: 16 },
}));

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function scalarText(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return '—';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

// A real collapsible JSON/YAML tree, not a flat <pre> dump - the follow-up
// ask (2026-09-09) after the flat text view shipped. Renders straight off
// the JS object (no round-trip through a YAML string), so collapsing a
// node is just local component state, not string manipulation. Defaults to
// open for the first two levels and collapsed below that - deep Kubernetes
// specs nest a long way, and starting fully expanded defeats the point of
// adding collapse at all. `defaultExpanded` overrides that depth heuristic
// entirely (every node starts open, regardless of depth) - for a caller
// showing a real document someone asked to read in full (JsonDocumentView's
// own default, 2026-09-17: "make the JSON tree default to fully expanded"),
// not a wide K8s spec someone's skimming. Still collapsible node-by-node
// either way - this only changes the starting state.
export function JsonNode({
  label,
  value,
  depth,
  defaultExpanded,
}: {
  label?: string;
  value: unknown;
  depth: number;
  defaultExpanded?: boolean;
}) {
  const t = useHangarTokens();
  const classes = useTreeStyles({ t });
  const [open, setOpen] = useState(defaultExpanded ?? depth < 2);

  if (isPlainObject(value) || Array.isArray(value)) {
    const isArray = Array.isArray(value);
    const entries: Array<[string, unknown]> = isArray
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value);
    if (entries.length === 0) {
      return (
        <div className={classes.row}>
          <span className={classes.toggleSpacer} />
          {label !== undefined && <span className={classes.key}>{label}:</span>}
          <span className={classes.punct}>{isArray ? '[]' : '{}'}</span>
        </div>
      );
    }
    return (
      <div>
        <div className={classes.row}>
          <button type="button" className={classes.toggle} onClick={() => setOpen(o => !o)}>
            {open ? '▾' : '▸'}
          </button>
          {label !== undefined && <span className={classes.key}>{label}:</span>}
          {!open && (
            <button type="button" className={classes.placeholder} onClick={() => setOpen(true)}>
              {isArray ? `[${entries.length} items]` : `{${entries.length} keys}`}
            </button>
          )}
        </div>
        {open && (
          <div className={classes.children}>
            {entries.map(([k, v]) => (
              <JsonNode key={k} label={k} value={v} depth={depth + 1} defaultExpanded={defaultExpanded} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={classes.row}>
      <span className={classes.toggleSpacer} />
      {label !== undefined && <span className={classes.key}>{label}:</span>}
      <span className={classes.scalar}>{scalarText(value)}</span>
    </div>
  );
}

const useDocStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  box: {
    padding: '10px 12px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
    maxHeight: 420,
    overflow: 'auto',
  },
}));

// A bordered, scrollable version of JsonNode's collapsible tree, for any
// caller that wants to show a real JSON document (not a K8sResourceRef) -
// e.g. PipelineFlow's StageDrawer viewing an attestation's raw predicate
// (the actual SLSA provenance / CycloneDX SBOM document, not just its
// verification status). Defaults to fully expanded rather than JsonNode's
// own depth<2 heuristic (2026-09-17 ask) - someone clicking "view SBOM"
// wants to actually read it, not excavate it one collapsed node at a time.
// Every node still collapses individually on click, so a caller with a
// genuinely huge document isn't stuck with it.
export function JsonDocumentView({ value, defaultExpanded = true }: { value: unknown; defaultExpanded?: boolean }) {
  const t = useHangarTokens();
  const classes = useDocStyles({ t });
  return (
    <div className={classes.box}>
      <JsonNode value={value} depth={0} defaultExpanded={defaultExpanded} />
    </div>
  );
}

export function ResourceYamlView({ resource }: { resource: K8sResourceRef }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const value = redactIfSecret(resource);
  return (
    <div>
      <div className={classes.head}>
        <span className={classes.kind}>{resource.kind}</span>
        <span className={classes.name}>{resource.name}</span>
      </div>
      {resource.kind === 'Secret' && (
        <Typography className={classes.secretNote}>
          Values redacted below - this is a real Secret, not a preview of one.
        </Typography>
      )}
      <KvList title="Labels" data={resource.labels} classes={classes} />
      <KvList title="Annotations" data={resource.annotations} classes={classes} />
      <Typography className={classes.sectionLabel}>Resource</Typography>
      <div className={classes.tree}>
        <JsonNode value={value} depth={0} />
      </div>
    </div>
  );
}

const useListStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: ({ t }) => t.textFaint,
    padding: '4px 10px 6px 0',
  },
  // A visible row separator - without it, nothing signaled these rows were
  // clickable at all (2026-09-09 feedback) beyond a hover color that only
  // shows up once the pointer is already there.
  row: {
    cursor: 'pointer',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  rowSelected: { backgroundColor: ({ t }) => t.panelAlt },
  td: { padding: '7px 10px 7px 0', fontSize: 12, fontFamily: fontMono, color: ({ t }) => t.textHi },
  kindTd: { color: ({ t }) => t.textFaint },
  detail: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: ({ t }) => `1px dashed ${t.line}`,
  },
  detailHead: { display: 'flex', justifyContent: 'flex-end', marginBottom: -4 },
  close: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
}));

// Exported so callers holding their own K8sResourceRef (EnvironmentTopology's
// inspect-panel toggle logic) can key off the same stable identity this list
// uses for its own selection state, instead of comparing object references
// that go stale every poll tick.
export function resourceKey(r: K8sResourceRef): string {
  return `${r.kind}/${r.namespace}/${r.name}`;
}

// Grouped by kind (Pod/Service/ConfigMap/... - see RESOURCE_KIND_LABEL in
// useTowerEnvironments.ts) so "everything deployed here" reads as a real
// inventory, not an arbitrary flat dump. Clicking a row expands its YAML/
// labels/annotations inline via ResourceYamlView, same click-to-expand
// pattern as every other Tower drawer. Selection tracked by a stable
// kind/namespace/name key rather than object identity - useTowerEnvironments
// rebuilds a fresh `resources` array on every poll tick, so comparing
// references would silently lose the selection a few seconds after opening
// it.
export function ResourceList({ resources }: { resources: K8sResourceRef[] }) {
  const t = useHangarTokens();
  const classes = useListStyles({ t });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const byKind = new Map<string, K8sResourceRef[]>();
  resources.forEach(r => {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  });
  const kinds = [...byKind.keys()].sort();
  const selected = selectedKey ? resources.find(r => resourceKey(r) === selectedKey) : undefined;

  return (
    <div>
      <table className={classes.table}>
        <thead>
          <tr>
            <th className={classes.th}>Kind</th>
            <th className={classes.th}>Name</th>
          </tr>
        </thead>
        <tbody>
          {kinds.flatMap(kind =>
            (byKind.get(kind) ?? []).map(r => {
              const key = resourceKey(r);
              const isSelected = selectedKey === key;
              return (
                <tr
                  key={key}
                  className={`${classes.row} ${isSelected ? classes.rowSelected : ''}`}
                  onClick={() => setSelectedKey(isSelected ? null : key)}
                >
                  <td className={`${classes.td} ${classes.kindTd}`}>{r.kind}</td>
                  <td className={classes.td}>{r.name}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
      <Collapse in={Boolean(selected)} unmountOnExit>
        {selected && (
          <div className={classes.detail}>
            <div className={classes.detailHead}>
              <button type="button" className={classes.close} onClick={() => setSelectedKey(null)}>
                close ✕
              </button>
            </div>
            <ResourceYamlView resource={selected} />
          </div>
        )}
      </Collapse>
    </div>
  );
}
