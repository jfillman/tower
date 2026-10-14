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
import { Button, StatusChip, TextLink, type StatusTone } from './ui';

// The app's release mode at the top of the Record tab (Release Record R2): Hand-flown needs a
// sign-off before production, Assisted records it, Autoland (later) lands on its own. Admins
// change it with a PR to the platform-owned release-modes file; everyone else just sees it.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 12.5 },
  caption: { color: ({ t }) => t.textLo },
  help: { color: ({ t }) => t.textLo, flex: '1 1 320px', minWidth: 0 },
  choices: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, width: '100%' },
  error: { color: ({ t }) => t.bad },
}));

const TONE: Record<ReleaseMode, StatusTone> = { 'hand-flown': 'warn', assisted: 'info', autoland: 'ok' };

export function ReleaseModeBar({
  info,
  submitting,
  error,
  prUrl,
  onChange,
}: {
  info: ReleaseModeInfo;
  submitting: boolean;
  error?: string;
  prUrl?: string;
  onChange: (mode: ReleaseMode) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [choosing, setChoosing] = useState(false);
  const where = `${info.file.repo}/${info.file.path}`;

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
                onClick={() => onChange(m)}
              >
                {available ? `Set ${RELEASE_MODE_LABEL[m]}` : `${RELEASE_MODE_LABEL[m]} (not available yet)`}
              </Button>
            );
          })}
          <span className={classes.caption}>Opens a PR to {where}; it takes effect when it merges.</span>
        </div>
      )}
      {prUrl && (
        <span className={classes.caption}>
          Mode change PR opened · <TextLink href={prUrl}>review ↗</TextLink>
        </span>
      )}
      {error && <span className={classes.error}>{error}</span>}
    </div>
  );
}
