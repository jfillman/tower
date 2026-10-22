import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { useSearchParams } from 'react-router-dom';
import { useEntity } from '@backstage/plugin-catalog-react';
import type { Notification } from '@backstage/plugin-notifications-common';
import { relativeTime } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { TowerEmptyState } from '../TowerEmptyState';
import { EmptyNote, PageHeader, Section, TabError, TabSkeleton } from '../ui';
import { isRecentNotification, useAppNotifications } from '../useAppNotifications';
import { renderNotificationDescription } from '../notificationFormatting';

// 2026-09-09 feedback: drop the stock notifications plugin's read/unread
// model - "I don't think we need the user to have to manage these incoming
// notifications." Replaced with a purely time-based split (see
// useAppNotifications' own RECENT_THRESHOLD_MS comment): "New" (last hour)
// vs "Earlier", same sectioned-table pattern PullRequestsTab already
// establishes for "open vs recently merged". No click-to-dismiss, no per-row
// interaction at all - a notification just ages from one section to the
// other on its own.
const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  stack: { display: 'flex', flexDirection: 'column', gap: 16 },
  row: {
    display: 'flex',
    gap: 12,
    padding: '14px 20px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    borderLeft: '3px solid transparent',
  },
  newRow: {
    backgroundColor: ({ t }) => t.amberSoft,
    borderLeftColor: ({ t }) => t.amber,
  },
  dot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 6 },
  body: { flex: 1, minWidth: 0 },
  head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: fontDisplay, fontWeight: 400, fontSize: 13, color: ({ t }) => t.textLo },
  titleNew: { fontWeight: 700, color: ({ t }) => t.textHi },
  time: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, whiteSpace: 'nowrap' },
  // Inline within a description line (2026-09-12: "any image should take you
  // to the image in the Images tab, a PR should link you to the actual PR,
  // any repo should link you to the repo/commit") - unlike `link` above,
  // this has no marginTop/display:block, since it sits mid-line next to
  // plain text rather than on its own row. Doubles as a <button> reset for
  // the Image case (an in-app tab jump, not a real href) so it matches the
  // <a> cases' look exactly.
  inlineLink: {
    font: 'inherit',
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'none',
    '&:hover': { textDecoration: 'underline' },
  },
  description: {
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.textLo,
    whiteSpace: 'pre-wrap',
    marginTop: 4,
  },
  topic: {
    fontFamily: fontMono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '1px 6px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textFaint,
    marginRight: 8,
  },
}));

function NotificationRow({
  n,
  isNew,
  classes,
  t,
  goToImage,
}: {
  n: Notification;
  isNew: boolean;
  classes: ReturnType<typeof useStyles>;
  t: HangarTokens;
  goToImage: (tag: string) => void;
}) {
  return (
    <div className={`${classes.row} ${isNew ? classes.newRow : ''}`}>
      <span className={classes.dot} style={{ backgroundColor: isNew ? t.amber : t.textFaint }} />
      <div className={classes.body}>
        <div className={classes.head}>
          <Typography className={`${classes.title} ${isNew ? classes.titleNew : ''}`}>
            {n.payload.title}
          </Typography>
          <span className={classes.time}>{relativeTime(n.created)}</span>
        </div>
        {n.payload.topic && <span className={classes.topic}>{n.payload.topic}</span>}
        {n.payload.description && (
          <Typography className={classes.description} component="div">
            {renderNotificationDescription(n.payload.description, goToImage, classes.inlineLink)}
          </Typography>
        )}
      </div>
    </div>
  );
}

export function NotificationsTab() {
  const { entity } = useEntity();
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();
  const projectSlug = entity.metadata.annotations?.['github.com/project-slug'];
  const appName = projectSlug ? projectSlug.split('/')[1] : entity.metadata.name;
  const { notifications, loading, error } = useAppNotifications(appName);
  // Same jump-to-Images-tab mechanism as OverviewTab/SignalRail's own
  // goToImage (2026-09-12: "any image should take you to the image in the
  // Images tab").
  const goToImage = (tag: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set('tab', 'images');
    next.set('imageTag', tag);
    return next;
  });

  if (loading) return <TabSkeleton />;
  if (error) return <TabError error={error} what="notifications" />;
  if (notifications.length === 0) {
    return (
      <div>
        <PageHeader title="Notifications" subtitle={`Build, test, deploy and release results Glidepath posted for ${appName}.`} />
        <TowerEmptyState
          title="No notifications yet"
          description={`Nothing from Glidepath's pipelines has landed here for ${appName}. Enable notifications.backstage in this app's cicd.yaml to start receiving build/test/deploy/release results here.`}
        />
      </div>
    );
  }

  const recent = notifications.filter(n => isRecentNotification(n));
  const earlier = notifications.filter(n => !isRecentNotification(n));

  return (
    <div>
      <PageHeader title="Notifications" subtitle={`Build, test, deploy and release results Glidepath posted for ${appName}.`} />
      <div className={classes.stack}>
      <Section framed title="New" count="last hour">
        {recent.length === 0 ? (
          <EmptyNote inset>Nothing new in the last hour.</EmptyNote>
        ) : (
          recent.map(n => <NotificationRow key={n.id} n={n} isNew classes={classes} t={t} goToImage={goToImage} />)
        )}
      </Section>

      <Section framed title="Earlier" count={`${earlier.length} shown`}>
        {earlier.length === 0 ? (
          <EmptyNote inset>Nothing older yet.</EmptyNote>
        ) : (
          earlier.map(n => <NotificationRow key={n.id} n={n} isNew={false} classes={classes} t={t} goToImage={goToImage} />)
        )}
      </Section>
      </div>
    </div>
  );
}
