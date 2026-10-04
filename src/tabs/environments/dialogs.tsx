import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContentText from '@material-ui/core/DialogContentText';
import Checkbox from '@material-ui/core/Checkbox';
import Radio from '@material-ui/core/Radio';
import RadioGroup from '@material-ui/core/RadioGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Link from '@material-ui/core/Link';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { applyStaged, validateAddedFlight, validateEnvironments, type CloudBlock, type EnvDef } from '../../environments/stagedChanges';
import { Button, Field } from '../../ui';
import { useUi } from '../../ui/styles';
import { MAIN_FIELD } from './shared';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  paper: { backgroundColor: ({ t }) => t.panel, backgroundImage: 'none', border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, minWidth: 440 },
  stack: { display: 'flex', flexDirection: 'column', gap: 12 },
  mono: { fontFamily: fontMono, fontSize: 12 },
  note: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 8 },
  problem: { fontSize: 12.5, color: ({ t }) => t.bad, marginTop: 10 },
}));

function useDialogStyles() {
  const t = useHangarTokens();
  return { t, c: useStyles({ t }), ui: useUi({ t }) };
}

export function AddEnvironmentDialog({
  open,
  onClose,
  current,
  problems,
  targetId,
  targetLabel,
  cloudBlock,
  duplicateOf,
  onStage,
}: {
  open: boolean;
  onClose: () => void;
  current: EnvDef[];
  problems: string[];
  targetId: string;
  targetLabel: string;
  cloudBlock?: CloudBlock;
  /** Duplicating: the environment this one starts as a copy of (tier, cluster and settings; the user names it). */
  duplicateOf?: EnvDef;
  onStage: (env: EnvDef, releaseStep: boolean, copyValuesFrom?: string) => void;
}) {
  const { c } = useDialogStyles();
  const [name, setName] = useState('');
  const [tier, setTier] = useState<'ground' | 'flight'>(duplicateOf?.tier ?? 'ground');
  const [cluster, setCluster] = useState(duplicateOf?.cluster ?? '');
  const [override, setOverride] = useState('');
  const [releaseStep, setReleaseStep] = useState(true);
  const [copyValues, setCopyValues] = useState(true);
  const mainField = cloudBlock ? MAIN_FIELD[cloudBlock] : undefined;
  // Flight needs a Kubernetes app: a cloud target has no approval path for it yet.
  const flightAllowed = !cloudBlock;
  // Clusters this app's Flight environments already run on, as suggestions (any registered upper cluster works).
  const knownClusters = [...new Set(current.filter(e => e.tier === 'flight' && e.cluster).map(e => e.cluster as string))];

  const candidate: EnvDef = { name: name.trim(), tier };
  if (tier === 'flight' && cluster.trim()) candidate.cluster = cluster.trim();
  if (tier === 'ground' && cloudBlock && mainField && override.trim()) candidate[cloudBlock] = { [mainField]: override.trim() };
  // A duplicate of a cloud environment keeps its other settings, but not the resource it points at: two environments on the
  // same function would deploy over each other.
  if (duplicateOf && cloudBlock && duplicateOf[cloudBlock]) {
    const { [mainField as string]: _own, ...rest } = duplicateOf[cloudBlock] as Record<string, unknown>;
    candidate[cloudBlock] = { ...rest, ...(candidate[cloudBlock] ?? {}) };
    if (Object.keys(candidate[cloudBlock] as object).length === 0) delete candidate[cloudBlock];
  }
  const withCandidate = applyStaged(current, [{ kind: 'add', env: candidate }]);
  const fresh = name.trim()
    ? [...validateEnvironments(withCandidate, targetId), ...validateAddedFlight(current, withCandidate, targetId)].filter(
        p => !problems.includes(p),
      )
    : [];
  const ok = Boolean(name.trim()) && fresh.length === 0;

  const reset = () => {
    setName('');
    setTier('ground');
    setCluster('');
    setOverride('');
    setReleaseStep(true);
    setCopyValues(true);
  };
  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} PaperProps={{ className: c.paper }}>
      <DialogTitle>{duplicateOf ? `Duplicate ${duplicateOf.name}` : 'Add environment'}</DialogTitle>
      <DialogContent>
        <div className={c.stack}>
          <Field id="add-env-name" label="Name">
            {p => <input {...p} autoFocus value={name} onChange={e => setName(e.target.value)} />}
          </Field>
          <div className={c.note} style={{ marginTop: -6 }}>
            Lowercase letters, digits and &apos;-&apos;, for example qa.
          </div>
          <RadioGroup aria-label="Tier" value={tier} onChange={e => setTier(e.target.value as 'ground' | 'flight')}>
            <FormControlLabel value="ground" disabled={Boolean(duplicateOf)} control={<Radio size="small" />} label="Ground: deploys on every push" />
            <FormControlLabel
              value="flight"
              disabled={!flightAllowed || Boolean(duplicateOf)}
              control={<Radio size="small" />}
              label="Flight: deploys only through an approved release"
            />
          </RadioGroup>
          {!flightAllowed && (
            <div className={c.note}>
              Flight environments are not available for {targetLabel} yet: a cloud target has no approval path for them.
            </div>
          )}
          {tier === 'flight' && (
            <>
              <Field id="add-env-cluster" label="Cluster">
                {p => <input {...p} list="flight-clusters" value={cluster} onChange={e => setCluster(e.target.value)} />}
              </Field>
              <datalist id="flight-clusters">
                {knownClusters.map(k => (
                  <option key={k} value={k} />
                ))}
              </datalist>
              <div className={c.note} style={{ marginTop: -6 }}>
                The registered upper cluster it runs on, for example kind-prod.
              </div>
              <div className={c.note}>
                Creating a Flight environment opens two pull requests: an ApplicationEnvironment request on the tenants repo,
                then the cicd.yaml change. Merge the request first.
              </div>
              <FormControlLabel
                control={<Checkbox size="small" checked={releaseStep} onChange={e => setReleaseStep(e.target.checked)} />}
                label="Also add a release step for it to the pipeline"
              />
              <div className={c.note} style={{ marginTop: -6 }}>
                Without a release step nothing in CI releases to this environment. It goes right after the step for the
                environment before it. Untick to edit the pipeline yourself in the Glidepath tab.
              </div>
            </>
          )}
          {tier === 'ground' && cloudBlock && mainField && (
            <>
              <Field id="add-env-override" label={`${targetLabel} ${mainField} (optional)`}>
                {p => <input {...p} value={override} onChange={e => setOverride(e.target.value)} />}
              </Field>
              <div className={c.note} style={{ marginTop: -6 }}>
                Leave empty to use the app-level value.
              </div>
            </>
          )}
          {duplicateOf && !cloudBlock && (
            <>
              <FormControlLabel
                control={<Checkbox size="small" checked={copyValues} onChange={e => setCopyValues(e.target.checked)} />}
                label={`Copy the values of ${duplicateOf.name}`}
              />
              <div className={c.note} style={{ marginTop: -6 }}>
                {tier === 'ground'
                  ? `The new environment's values file is created in the same pull request, with the values of ${duplicateOf.name} (its own image excluded).`
                  : `A Flight environment's values file is written by Crossplane after its request merges. When it exists, use "Copy values from" in its Values tab.`}
              </div>
            </>
          )}
          {duplicateOf && cloudBlock && mainField && (
            <div className={c.note}>
              Settings are copied except {mainField}: give it its own above, or both environments will deploy to the same resource.
            </div>
          )}
          {fresh.map(p => (
            <div key={p} className={c.problem} style={{ marginTop: 0 }}>
              {p}
            </div>
          ))}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!ok}
          onClick={() => {
            onStage(candidate, tier === 'flight' && releaseStep, duplicateOf && !cloudBlock && copyValues ? duplicateOf.name : undefined);
            reset();
          }}
        >
          {duplicateOf ? 'Stage duplicate' : 'Stage environment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function RemoveEnvironmentDialog({
  name,
  appName,
  cloud,
  files,
  blockedBy,
  onCancel,
  onConfirm,
}: {
  name: string;
  appName?: string;
  cloud: boolean;
  files: string[];
  blockedBy: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { c } = useDialogStyles();
  const [typed, setTyped] = useState('');
  const blocked = blockedBy.length > 0;
  return (
    <Dialog open onClose={onCancel} PaperProps={{ className: c.paper }}>
      <DialogTitle>Remove {name}</DialogTitle>
      <DialogContent>
        {blocked ? (
          <DialogContentText className={c.problem} style={{ marginTop: 0 }}>
            {blockedBy.map(p => `Pipeline "${p}"`).join(', ')} still {blockedBy.length > 1 ? 'have' : 'has'} a step for {name}. Remove
            the step in the Glidepath tab first, then come back.
          </DialogContentText>
        ) : (
          <div className={c.stack}>
            <DialogContentText component="div">
              Staging this removes {name} from cicd.yaml. Nothing happens until you open the pull request and merge it.
              {cloud ? (
                <div className={c.note}>The cloud resource this environment deployed to is not deleted. Remove it in your cloud account.</div>
              ) : (
                <>
                  <div className={c.note}>The same pull request deletes, where they exist:</div>
                  <ul className={c.mono}>
                    {files.map(f => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <div className={c.note}>
                    After it merges, Argo CD prunes the Application{' '}
                    <span className={c.mono}>
                      {appName}-{name}
                    </span>{' '}
                    and the namespace{' '}
                    <span className={c.mono}>
                      app-{appName}-{name}
                    </span>
                    , deleting everything running in it.
                  </div>
                </>
              )}
            </DialogContentText>
            <Field id="remove-env-confirm" label={`Type ${name} to confirm`}>
              {p => <input {...p} autoFocus value={typed} onChange={e => setTyped(e.target.value)} />}
            </Field>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" disabled={blocked || typed !== name} onClick={onConfirm}>
          Stage removal
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ChangeResultDialog({
  requests,
  cicdPrUrl,
  error,
  onClose,
}: {
  requests: Array<{ env: string; url: string }>;
  cicdPrUrl?: string;
  error?: string;
  onClose: () => void;
}) {
  const { c } = useDialogStyles();
  return (
    <Dialog open onClose={onClose} PaperProps={{ className: c.paper }}>
      <DialogTitle>{error ? 'Something needs attention' : 'Pull requests opened'}</DialogTitle>
      <DialogContent>
        {error && <DialogContentText className={c.problem} style={{ marginTop: 0 }}>{error}</DialogContentText>}
        {requests.length > 0 && (
          <DialogContentText component="div">
            {requests.map((r, i) => (
              <div key={r.env}>
                {i + 1}. ApplicationEnvironment request for {r.env}:{' '}
                <Link href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.url}
                </Link>
              </div>
            ))}
          </DialogContentText>
        )}
        {cicdPrUrl && (
          <DialogContentText component="div">
            {requests.length > 0 ? `${requests.length + 1}. ` : ''}cicd.yaml change:{' '}
            <Link href={cicdPrUrl} target="_blank" rel="noopener noreferrer">
              {cicdPrUrl}
            </Link>
          </DialogContentText>
        )}
        {requests.length > 0 && cicdPrUrl && (
          <DialogContentText>Merge the ApplicationEnvironment request first, then the cicd.yaml change.</DialogContentText>
        )}
        {error && requests.length > 0 && !cicdPrUrl && (
          <DialogContentText>The request(s) above are already open and will not be opened again if you try again.</DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
