import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Link from '@material-ui/core/Link';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { currentStep, type EnvLifecycleStep } from '../../environments/lifecycle';
import type { StepState } from '../../provisioning/deriveProvisioning';
import { Button } from '../../ui';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, backgroundColor: ({ t }) => t.panel, padding: '10px 14px' },
  head: { display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  title: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  sub: { fontSize: 12.5, color: ({ t }) => t.textLo },
  list: { listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  item: { display: 'grid', gridTemplateColumns: '18px 1fr', gap: 10, alignItems: 'start' },
  dot: { width: 10, height: 10, borderRadius: '50%', marginTop: 4, border: '2px solid transparent' },
  stepTitle: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  desc: { fontSize: 12, color: ({ t }) => t.textLo },
  detail: { fontSize: 12, fontFamily: fontMono, color: ({ t }) => t.textLo, marginTop: 2 },
  links: { display: 'flex', gap: 12, marginTop: 4, fontSize: 12 },
}));

const LABEL: Record<StepState, string> = { done: 'done', run: 'in progress', pend: 'waiting', fail: 'failed' };

function dotStyle(state: StepState, t: HangarTokens) {
  if (state === 'done') return { backgroundColor: t.good };
  if (state === 'run') return { backgroundColor: t.amber };
  if (state === 'fail') return { backgroundColor: t.bad };
  return { backgroundColor: 'transparent', borderColor: t.textFaint };
}

/**
 * Where a new environment is on its way to running: a collapsed one-line summary of the current step that opens
 * into every step with links to the pull requests, the repository files and the Infisical project.
 */
export function EnvLifecycle({ steps, initiallyOpen = false }: { steps: EnvLifecycleStep[]; initiallyOpen?: boolean }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const current = currentStep(steps);
  const [open, setOpen] = useState(initiallyOpen);
  const doneCount = steps.filter(s => s.state === 'done').length;
  if (!current && !open) {
    return (
      <div className={c.wrap}>
        <div className={c.head}>
          <span className={c.title}>Provisioned</span>
          <Button small onClick={() => setOpen(true)}>
            Show steps
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className={c.wrap} role="group" aria-label="Provisioning progress">
      <div className={c.head}>
        <div>
          <div className={c.title}>{current ? `Provisioning: step ${doneCount + 1} of ${steps.length}` : 'Provisioned'}</div>
          {current && (
            <div className={c.sub}>
              {current.title}
              {current.detail ? `. ${current.detail}` : ''}
            </div>
          )}
        </div>
        <Button small onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? 'Hide steps' : 'Show steps'}
        </Button>
      </div>
      {open && (
        <ol className={c.list}>
          {steps.map(s => (
            <li key={s.id} className={c.item}>
              <i className={c.dot} style={dotStyle(s.state, t)} role="img" aria-label={LABEL[s.state]} />
              <div>
                <div className={c.stepTitle}>{s.title}</div>
                <div className={c.desc}>{s.desc}</div>
                {s.detail && <div className={c.detail}>{s.detail}</div>}
                {s.links && s.links.length > 0 && (
                  <div className={c.links}>
                    {s.links.map(l => (
                      <Link key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                        {l.label}
                        {l.state ? ` (${l.state})` : ''}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
