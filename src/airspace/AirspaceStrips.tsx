import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, fontScale, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { EmptyNote, Section, StatusChip, TextLink, Tooltip, useTableKit } from '../ui';
import { formatRate, formatSeconds, type AppAirspace, type Counterpart } from './model';
import { KIND_LABEL, STATE_HINT, STATE_LABEL, STATE_TONE } from './presentation';

// Flight Strips (mockup B): one framed section per direction, one row per counterpart. The default Airspace view:
// the densest and calmest way to read who an app talks to.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  stack: { display: 'flex', flexDirection: 'column', gap: 16 },
  scrollBox: { overflowX: 'auto' },
  // The three sections line up: same columns, same widths.
  stripTable: { tableLayout: 'fixed', minWidth: 760 },
  colName: { width: '28%' },
  colNum: { width: '11%' },
  colState: { width: '18%' },
  colLink: { width: '10%' },
  peerName: { fontFamily: fontMono, fontSize: fontScale.md, color: ({ t }) => t.textHi },
  peerKind: { display: 'block', fontSize: fontScale.sm, color: ({ t }) => t.textLo, marginTop: 2 },
  num: { fontFamily: fontMono, fontSize: fontScale.sm, whiteSpace: 'nowrap' },
  errNum: { color: ({ t }) => t.bad },
}));

const SECTIONS: Array<{ key: 'inbound' | 'outbound' | 'owned'; title: string; empty: string }> = [
  { key: 'inbound', title: 'Inbound', empty: 'Nothing called this app in the window, and nothing is declared as allowed to.' },
  { key: 'outbound', title: 'Outbound', empty: 'This app called nothing outside its own components in the window.' },
  { key: 'owned', title: 'Owned infrastructure', empty: 'No components in this environment’s values file.' },
];

function declaredText(r: Counterpart, valuesKnown: boolean): string {
  if (r.direction === 'owned') return 'components[]';
  if (r.kind === 'ingress') return 'gateway';
  if (r.state === 'broker') return 'via broker';
  if (!valuesKnown) return '—';
  if (!r.declared) return 'no';
  return r.ports?.length ? `yes · ${r.ports.join(', ')}` : 'yes';
}

export function AirspaceStrips({
  airspace,
  valuesKnown,
  onOpenApp,
}: {
  airspace: AppAirspace;
  valuesKnown: boolean;
  /** Re-centre on another app (opens its Airspace tab). */
  onOpenApp?: (app: string) => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  return (
    <div className={c.stack}>
      {SECTIONS.map(s => {
        const rows = airspace[s.key];
        return (
          <Section key={s.key} title={s.title} count={rows.length} framed>
            {rows.length === 0 ? (
              <EmptyNote inset>{s.empty}</EmptyNote>
            ) : (
              <div className={c.scrollBox}>
                <table className={`${tk.table} ${c.stripTable}`}>
                  <colgroup>
                    <col className={c.colName} />
                    <col className={c.colNum} />
                    <col className={c.colNum} />
                    <col className={c.colNum} />
                    <col className={c.colNum} />
                    <col className={c.colState} />
                    <col className={c.colLink} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={tk.th}>Counterpart</th>
                      <th className={tk.th}>Declared</th>
                      <th className={tk.th}>Traffic</th>
                      <th className={tk.th}>p95</th>
                      <th className={tk.th}>Errors</th>
                      <th className={tk.th}>State</th>
                      <th className={tk.th} aria-label="Links" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td className={tk.td}>
                          <span className={c.peerName}>{r.name}</span>
                          <span className={c.peerKind}>
                            {r.componentType ? `${r.componentType} · ` : ''}
                            {KIND_LABEL[r.kind]}
                          </span>
                        </td>
                        <td className={tk.td}>
                          <span className={c.num}>{declaredText(r, valuesKnown)}</span>
                        </td>
                        <td className={tk.td}>
                          <span className={c.num}>{r.observed ? formatRate(r.observed.rate) : '—'}</span>
                        </td>
                        <td className={tk.td}>
                          <span className={c.num}>{formatSeconds(r.observed?.p95)}</span>
                        </td>
                        <td className={tk.td}>
                          <span className={`${c.num} ${r.observed && r.observed.errorRate > 0 ? c.errNum : ''}`}>
                            {r.observed ? formatRate(r.observed.errorRate) : '—'}
                          </span>
                        </td>
                        <td className={tk.td}>
                          <Tooltip title={STATE_HINT[r.state]}>
                            <span>
                              <StatusChip tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</StatusChip>
                            </span>
                          </Tooltip>
                        </td>
                        <td className={tk.td}>
                          {r.app && onOpenApp && <TextLink onClick={() => onOpenApp(r.app!)}>Open →</TextLink>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        );
      })}
    </div>
  );
}
