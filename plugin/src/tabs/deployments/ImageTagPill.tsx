import { makeStyles } from '@material-ui/core/styles';
import { fontMono } from '../../../brand/tokens';
import { slugHue } from '../../PipelineRunList';

// The tag + real flow-correlation nickname pill (e.g. "0.1.6-8b21e4f
// lively finch") - same "tag, colored slug chip" language OverviewTab's
// image rail and ReleaseMatrix already use (nicknameForImageTag +
// slugHue), reused here rather than reinvented so an image reads the same
// way everywhere Tower shows one (2026-09-16: "everywhere the image is
// displayed, it should include the slug pill"). No theme dependence (every
// color here is either fixed or derived from the slug's own hash), so this
// skips the usual `{ t: HangarTokens }` makeStyles param other Tower
// components thread through.

const useStyles = makeStyles(() => ({
  wrap: { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: fontMono, minWidth: 0 },
  tag: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  slug: {
    display: 'inline-block',
    flexShrink: 0,
    fontSize: 10,
    padding: '1px 7px',
    borderRadius: 8,
    border: '1px solid',
  },
}));

// Just the colored slug chip, extracted out of ImageTagPill below so a
// caller that already has its own typography for the tag/version text (the
// Release Record sub-tab's cards/masthead/compare columns, none of which
// want ImageTagPill's own fontMono treatment on that text) can still drop
// the exact same chip in next to it - "everywhere the image is displayed,
// it should include the slug pill" (2026-09-16) shouldn't mean a second,
// slightly-different chip implementation per caller.
export function NicknameChip({ nickname }: { nickname: string }) {
  const classes = useStyles();
  return (
    <span
      className={classes.slug}
      style={{
        color: `hsl(${slugHue(nickname)}, 65%, 60%)`,
        borderColor: `hsl(${slugHue(nickname)}, 65%, 60%)`,
        backgroundColor: `hsla(${slugHue(nickname)}, 65%, 60%, 0.12)`,
      }}
    >
      {nickname}
    </span>
  );
}

export function ImageTagPill({
  tag,
  nickname,
  size = 'normal',
}: {
  tag: string;
  nickname?: string;
  // 'small' for tight contexts (env-picker pills) - same colors, just a
  // step down in font size rather than a visually distinct treatment.
  size?: 'normal' | 'small';
}) {
  const classes = useStyles();
  return (
    <span className={classes.wrap} style={{ fontSize: size === 'small' ? 10.5 : undefined }}>
      <span className={classes.tag}>{tag}</span>
      {nickname && <NicknameChip nickname={nickname} />}
    </span>
  );
}
