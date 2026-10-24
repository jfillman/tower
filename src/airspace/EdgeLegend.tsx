import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useHangarTokens, type HangarTokens } from '../brand/tokens';
import { TextLink } from '../ui';
import type { EdgeState } from './model';
import { STATE_HINT, STATE_LABEL, STATE_TODO, edgeStroke } from './presentation';

// The legend under a graph: one line sample per edge state the graph actually draws, drawn with that edge's own
// stroke and dash, and an explainer that opens to say what each state means and what, if anything, to do about it.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 },
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 18px' },
  list: { display: 'flex', flexWrap: 'wrap', gap: '6px 18px', margin: 0, padding: 0, listStyle: 'none' },
  item: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: ({ t }) => t.textLo },
  explain: { margin: 0, display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '10px 14px', fontSize: 13 },
  term: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: ({ t }) => t.textHi, whiteSpace: 'nowrap' },
  def: { margin: 0, color: ({ t }) => t.textLo, lineHeight: 1.45, minWidth: 0 },
  todo: { display: 'block', marginTop: 2, color: ({ t }) => t.textHi },
}));

function Line({ state, t }: { state: EdgeState; t: HangarTokens }) {
  const s = edgeStroke(state, t);
  return (
    <svg width={28} height={8} aria-hidden>
      <line x1={0} y1={4} x2={28} y2={4} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
    </svg>
  );
}

export function EdgeLegend({ states }: { states: EdgeState[] }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const [open, setOpen] = useState(false);
  if (states.length === 0) return null;
  return (
    <div className={c.root}>
      <div className={c.bar}>
        <ul className={c.list} aria-label="Edge legend">
          {states.map(s => (
            <li key={s} className={c.item} title={STATE_HINT[s]}>
              <Line state={s} t={t} />
              {STATE_LABEL[s]}
            </li>
          ))}
        </ul>
        <TextLink expanded={open} onClick={() => setOpen(v => !v)}>
          What the lines mean
        </TextLink>
      </div>
      {open && (
        <dl className={c.explain} aria-label="What the lines mean">
          {states.map(s => (
            <div key={s} style={{ display: 'contents' }}>
              <dt className={c.term}>
                <Line state={s} t={t} />
                {STATE_LABEL[s]}
              </dt>
              <dd className={c.def}>
                {STATE_HINT[s]}
                <span className={c.todo}>{STATE_TODO[s]}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
