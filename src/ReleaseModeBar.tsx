import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useHangarTokens, type HangarTokens } from './brand/tokens';
import {
  RELEASE_MODE_HELP,
  RELEASE_MODE_LABEL,
  RELEASE_MODES,
  type ReleaseMode,
  type ReleaseModeInfo,
} from './releaseFlow';
import { Button, Callout, StatusChip, TextLink, type StatusTone } from './ui';
import { OPENING_PR, PrReceipt } from './ui/PrRef';

// The app's release mode at the top of the Record tab (Release Record R2): Hand-flown needs a
// sign-off before production, Assisted records it, Autoland (later) lands on its own. Admins
// change it with a PR to the platform-owned release-modes file; everyone else just sees it.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 12 },
  caption: { color: ({ t }) => t.textLo },
  help: { color: ({ t }) => t.textLo, flex: '1 1 320px', minWidth: 0 },
  choices: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, width: '100%' },
  full: { width: '100%' },
}));

const TONE: Record<ReleaseMode, StatusTone> = { 'hand-flown': 'warn', assisted: 'info', autoland: 'ok' };

export function ReleaseModeBar({
  info,
  submitting,
  error,
  prUrl,
  alreadyOpen,
  waitingForMerge,
  onChange,
}: {
  info: ReleaseModeInfo;
  submitting: boolean;
  error?: string;
  prUrl?: string;
  /** The mode-change PR was already open (the route deduped the request). */
  alreadyOpen?: boolean;
  /** The PR is open and the mode file doesn't say the new mode yet: Tower is re-reading it. */
  waitingForMerge?: boolean;
  onChange: (mode: ReleaseMode) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [choosing, setChoosing] = useState(false);
  // The mode whose button was pressed: it carries the busy label.
  const [pressed, setPressed] = useState<ReleaseMode>();
  const where = `${info.file.repo}/${info.file.path}`;
  const modeLabel = (m: ReleaseMode, available: boolean) => {
    if (submitting && pressed === m) return OPENING_PR;
    return available ? `Set ${RELEASE_MODE_LABEL[m]}` : `${RELEASE_MODE_LABEL[m]} (not available yet)`;
  };

  return (
    <div className={classes.bar}>
      <span className={classes.caption}>Release mode</span>
      <StatusChip tone={TONE[info.mode]} dot>
        {RELEASE_MODE_LABEL[info.mode]}
      </StatusChip>
      <span className={classes.help}>
        {RELEASE_MODE_HELP[info.mode]}
        {info.mode === 'hand-flown' && info.signoffEnv && ` Sign-off goes on the ${info.signoffEnv} release PR.`}
        {info.source !== 'app' && ' (the platform default)'}
      </span>
      {info.canSetMode && (
        <TextLink expanded={choosing} onClick={() => setChoosing(v => !v)}>
          Change
        </TextLink>
      )}
      {choosing && (
        <div className={classes.choices}>
          {RELEASE_MODES.filter(m => m !== info.mode).map(m => {
            const available = info.settable.includes(m);
            return (
              <Button
                key={m}
                small
                disabled={!available || submitting}
                title={RELEASE_MODE_HELP[m]}
                onClick={() => {
                  setPressed(m);
                  onChange(m);
                }}
              >
{modeLabel(m, available)}
              </Button>
            );
          })}
          <span className={classes.caption}>Opens a PR to {where}; it takes effect when it merges.</span>
        </div>
      )}
      {prUrl && (
        <PrReceipt
          className={classes.full}
          prUrl={prUrl}
          alreadyOpen={alreadyOpen}
          next={waitingForMerge === false ? 'the mode has updated.' : 'merge it. The mode updates here once it lands.'}
        />
      )}
      {error && (
        <Callout tone="bad" className={classes.full}>
          {error}
        </Callout>
      )}
    </div>
  );
}
