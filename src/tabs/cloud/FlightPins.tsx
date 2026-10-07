import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import type { CloudDeploy } from '../../cloudDeploy';
import { promoteCandidates, rollbackCandidate, usePinState, useSubmitPin } from '../../environments/releasePins';
import { relativeTime } from '../../shared/format';
import { Button, Chip, Panel, SectionLabel, TierChip } from '../../ui';
import { useUi } from '../../ui/styles';

// Release pins for a cloud target's Flight environments (glidepath ADR-0020, slice 5). Each Flight environment shows
// the image it is pinned to, an open pin PR if there is one, and two actions that only ever open a pull request:
// Promote (pin a built image) and Roll back (restore the previous pin). Merging the PR is the approval; Glidepath's
// promote-<env> flow then deploys exactly the pinned digest.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  row: { padding: 14, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  head: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  name: { fontWeight: 600, fontSize: 15, color: ({ t }) => t.textHi },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, overflowWrap: 'anywhere' },
  pinned: { fontFamily: fontMono, fontSize: 14, color: ({ t }) => t.textHi },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  select: {
    fontFamily: fontMono,
    fontSize: 12,
    padding: '5px 8px',
    borderRadius: 4,
    maxWidth: '100%',
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    border: ({ t }) => `1px solid ${t.line}`,
  },
  ok: { fontSize: 12.5, color: ({ t }) => t.good },
  bad: { fontSize: 12.5, color: ({ t }) => t.bad },
}));

export interface FlightPinsProps {
  owner: string;
  appName: string;
  /** Flight environments, each with the environment before it in cicd.yaml order (Promote's default source). */
  flight: Array<{ name: string; previous?: string }>;
  deploys: CloudDeploy[];
}

export function FlightPins({ owner, appName, flight, deploys }: FlightPinsProps) {
  const ui = useUi({ t: useHangarTokens() });
  if (flight.length === 0) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <SectionLabel>Flight environments</SectionLabel>
      <div className={ui.note} style={{ margin: '6px 0 10px' }}>
        A Flight environment deploys only a pinned image. Promote and Roll back open a pull request that changes its
        pin; merging it is the approval, and Glidepath then deploys exactly that image.
      </div>
      {flight.map(f => (
        <FlightPinRow key={f.name} owner={owner} appName={appName} env={f.name} previous={f.previous} deploys={deploys} />
      ))}
    </div>
  );
}

function FlightPinRow({
  owner,
  appName,
  env,
  previous,
  deploys,
}: {
  owner: string;
  appName: string;
  env: string;
  previous?: string;
  deploys: CloudDeploy[];
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const [nonce, setNonce] = useState(0);
  const pin = usePinState({ owner, appName, env }, nonce);
  const submit = useSubmitPin();
  const candidates = useMemo(() => promoteCandidates(deploys, previous), [deploys, previous]);
  const [image, setImage] = useState('');
  const [confirmRollback, setConfirmRollback] = useState(false);
  useEffect(() => {
    if (!image && candidates[0]) setImage(candidates[0].image);
  }, [candidates, image]);

  const state = pin.data;
  const current = state?.current;
  const back = rollbackCandidate(state);
  const busy = submit.loading;
  const run = async (body: { image?: string; promotedFrom?: string; rollbackTo?: string }) => {
    setConfirmRollback(false);
    const r = await submit.submit({ owner, appName, env, ...body });
    if (r) setNonce(n => n + 1);
  };

  return (
    <Panel className={c.row}>
      <div className={c.head}>
        <span className={c.name}>{env}</span>
        <TierChip tier="flight" />
        <span className={c.mono}>{state?.path ?? `glidepath/releases/${env}.yaml`}</span>
        {state?.openPr && (
          <a href={state.openPr.url} target="_blank" rel="noreferrer">
            <Chip tone="flight">pin PR open ↗</Chip>
          </a>
        )}
      </div>

      {pin.error && <div className={c.bad}>Could not read the pin: {pin.error}</div>}
      {!pin.error && pin.loading && !state && <div className={ui.note}>Reading the pin…</div>}
      {state &&
        (current ? (
          <div>
            <div className={c.pinned}>{current.tag}</div>
            <div className={c.mono}>
              {current.digest.slice(0, 19)}…{current.promotedFrom ? ` · from ${current.promotedFrom}` : ''}
              {state.history[0]?.date ? ` · pinned ${relativeTime(new Date(state.history[0].date))}` : ''}
            </div>
          </div>
        ) : (
          <div className={ui.note}>Nothing pinned yet: {env} has never been released.</div>
        ))}

      <div className={c.actions}>
        {candidates.length > 0 ? (
          <>
            <select
              aria-label={`Image to promote to ${env}`}
              className={c.select}
              value={image}
              onChange={e => setImage(e.target.value)}
            >
              {candidates.map(o => (
                <option key={o.image} value={o.image}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              disabled={busy || !image}
              onClick={() => run({ image, promotedFrom: deploys.find(d => d.imageRef === image)?.env ?? previous })}
            >
              Promote to {env}
            </Button>
          </>
        ) : (
          <span className={ui.note}>No built image to promote yet.</span>
        )}
        {back?.pin &&
          (confirmRollback ? (
            <>
              <span className={ui.note}>
                Open a pull request pinning {env} back to {back.pin.tag}?
              </span>
              <Button variant="danger" disabled={busy} onClick={() => run({ rollbackTo: back.sha })}>
                Open rollback PR
              </Button>
              <Button onClick={() => setConfirmRollback(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="danger" disabled={busy} onClick={() => setConfirmRollback(true)}>
              Roll back to {back.pin.tag}
            </Button>
          ))}
      </div>

      {submit.error && <div className={c.bad}>{submit.error}</div>}
      {submit.result &&
        (submit.result.unchanged ? (
          <div className={ui.note}>{env} is already pinned to {submit.result.pin.tag}; no pull request needed.</div>
        ) : (
          <div className={c.ok}>
            {submit.result.alreadyOpen ? 'Updated the open pin PR' : 'Opened a pin PR'} for {submit.result.pin.tag}:{' '}
            <a href={submit.result.prUrl} target="_blank" rel="noreferrer">
              {submit.result.prUrl}
            </a>
            . Merge it to deploy.
          </div>
        ))}
    </Panel>
  );
}
