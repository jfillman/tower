import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontBody, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { preventFocusScroll } from '../preventFocusScroll';
import { Hint, SearchField } from '../ui';
import { searchSettings, type SettingHit } from './settingIndex';
import { useSettingFiles } from './useSettingFiles';

// "Find a setting" at the top of Configure: type a key (replicas, rollout steps, cache) or a value (1.42.0,
// hangar-prod) and see every file that sets it, with its value; pick one to open the sub-tab (and the environment's
// row) that edits it. The files are read the first time someone types (useSettingFiles).

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { position: 'relative', width: 380, maxWidth: '100%' },
  list: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    zIndex: 5,
    width: 460,
    maxWidth: '90vw',
    maxHeight: 420,
    overflowY: 'auto',
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
  },
  head: {
    padding: '8px 12px',
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textLo,
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  hit: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    border: 'none',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    background: 'none',
    cursor: 'pointer',
    color: ({ t }) => t.textHi,
    '&:hover, &:focus-visible': { backgroundColor: ({ t }) => t.panelAlt, outline: 'none' },
  },
  hitTop: { display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: fontBody, fontSize: 13 },
  hitKey: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.sky, overflowWrap: 'anywhere' },
  hitValue: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi, flexShrink: 0, maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hitPath: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo },
}));

const SUBTAB_NAME = { environments: 'Environments', config: 'Shared values', glidepath: 'Pipeline' } as const;

export function SettingFinder({ onOpen }: { onOpen: (hit: SettingHit) => void }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const files = useSettingFiles(query.trim().length >= 2);
  const hits = useMemo(() => searchSettings(files.files, query), [files.files, query]);
  if (!files.available) return null;
  const showList = open && query.trim().length >= 2;

  return (
    <div
      className={c.wrap}
      onFocus={() => setOpen(true)}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <SearchField label="Find a setting" placeholder="Find a setting: replicas, cache, 1.42.0…" value={query} onChange={setQuery} />
      {showList && (
        <div className={c.list} role="listbox" aria-label="Settings found">
          <div className={c.head}>
            {files.loading ? 'Reading the files…' : `${hits.length === 20 ? '20+' : hits.length} found in ${new Set(hits.map(h => h.file.path)).size} file(s)`}
          </div>
          {!files.loading && hits.length === 0 && <Hint inset>Nothing in cicd.yaml or the values files matches "{query.trim()}".</Hint>}
          {hits.map(hit => (
            <button
              key={`${hit.file.path}:${hit.key}`}
              type="button"
              role="option"
              aria-selected={false}
              className={c.hit}
              onMouseDown={preventFocusScroll}
              onClick={() => {
                setOpen(false);
                onOpen(hit);
              }}
            >
              <span className={c.hitTop}>
                <span>
                  {SUBTAB_NAME[hit.file.subtab]} › {hit.file.label}
                </span>
                <span className={c.hitValue}>{hit.value}</span>
              </span>
              <span className={c.hitKey}>{hit.key}</span>
              <span className={c.hitPath}>{hit.file.path}</span>
            </button>
          ))}
          {files.failed > 0 && (
            <Hint inset>
              {files.failed} file(s) could not be read; results may be incomplete.
            </Hint>
          )}
        </div>
      )}
    </div>
  );
}
