import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import PeopleIcon from '@material-ui/icons/People';
import SecurityIcon from '@material-ui/icons/Security';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import type { K8sResourceRef } from '../../types';

// Human-friendly rendering for Role/ClusterRole/RoleBinding/
// ClusterRoleBinding (2026-09-17 follow-up to the "all resources" gallery -
// "is it possible to display them in a human friendly manner" rather than
// raw YAML for these 4). A Role/ClusterRole's real content is its
// rules[] - apiGroups/resources/verbs/resourceNames, each broken into its
// own labeled pill group rather than left as YAML list syntax. A
// RoleBinding/ClusterRoleBinding's own fields (subjects[] + a roleRef) are
// only half the story on their own - the actually-useful question ("what
// does this binding actually grant, and to whom") needs the referenced
// Role/ClusterRole's rules resolved and shown alongside it, which is why
// this takes the full set of RBAC resources currently available
// (`related`) rather than just the one resource being viewed.

export const RBAC_KINDS = ['Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding'] as const;

interface RawPolicyRule {
  apiGroups?: string[];
  resources?: string[];
  resourceNames?: string[];
  verbs?: string[];
  nonResourceURLs?: string[];
}
interface RawRoleLike {
  rules?: RawPolicyRule[];
}
interface RawSubject {
  kind?: string;
  name?: string;
  namespace?: string;
}
interface RawRoleRef {
  kind?: string;
  name?: string;
}
interface RawBindingLike {
  subjects?: RawSubject[];
  roleRef?: RawRoleRef;
}

// Kubernetes' own verb vocabulary, grouped by real blast radius - read-only
// (get/list/watch), mutating-but-bounded (create/update/patch), and the two
// that either destroy data or grant more access than they use
// (delete/deletecollection, and RBAC's own escalate/bind/impersonate) - so
// the pill color itself says something about risk, not just which verb.
function verbTone(t: HangarTokens, verb: string): { color: string; bg: string } {
  if (['get', 'list', 'watch'].includes(verb)) return { color: t.good, bg: t.goodSoft };
  if (['delete', 'deletecollection', 'escalate', 'bind', 'impersonate'].includes(verb)) return { color: t.bad, bg: t.badSoft };
  return { color: t.amberInk, bg: t.amberSoft };
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 8 },
  sectionIcon: { display: 'flex', color: ({ t }) => t.sky },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  bindingCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 14px',
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
  },
  bindingHead: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kindChip: {
    fontFamily: fontMono,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '2px 8px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky,
  },
  bindingName: { fontFamily: fontMono, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  bindingMeta: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  subjectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    borderRadius: 20,
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    fontFamily: fontMono,
    fontSize: 11.5,
    alignSelf: 'flex-start',
  },
  subjectKind: { color: ({ t }) => t.textFaint },
  subjectName: { color: ({ t }) => t.sky, fontWeight: 600 },
  subjectNs: { color: ({ t }) => t.textFaint },
  kvRow: { display: 'flex', gap: 20 },
  kv: { display: 'flex', flexDirection: 'column', gap: 2 },
  kvLabel: { fontFamily: fontMono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: ({ t }) => t.textFaint },
  kvValue: { fontFamily: fontMono, fontSize: 15, fontWeight: 700, color: ({ t }) => t.textHi },
  ruleCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panel,
  },
  ruleGroup: { display: 'flex', flexDirection: 'column', gap: 5 },
  ruleLabel: { fontFamily: fontMono, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: ({ t }) => t.textFaint },
  pillRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  pill: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: 5,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
  },
  resourceNamePill: { backgroundColor: ({ t }) => t.skySoft, color: ({ t }) => t.sky },
  note: { fontSize: 12, fontStyle: 'italic', color: ({ t }) => t.textFaint },
}));

function RuleCard({ rule, classes, t }: { rule: RawPolicyRule; classes: ReturnType<typeof useStyles>; t: HangarTokens }) {
  const groups = (rule.apiGroups ?? []).map(g => (g === '' ? 'core' : g));
  return (
    <div className={classes.ruleCard}>
      {groups.length > 0 && (
        <div className={classes.ruleGroup}>
          <span className={classes.ruleLabel}>API Groups</span>
          <div className={classes.pillRow}>
            {groups.map(g => (
              <span key={g} className={classes.pill}>{g}</span>
            ))}
          </div>
        </div>
      )}
      {(rule.resources ?? []).length > 0 && (
        <div className={classes.ruleGroup}>
          <span className={classes.ruleLabel}>Resources</span>
          <div className={classes.pillRow}>
            {rule.resources!.map(r => (
              <span key={r} className={classes.pill}>{r}</span>
            ))}
          </div>
        </div>
      )}
      {(rule.verbs ?? []).length > 0 && (
        <div className={classes.ruleGroup}>
          <span className={classes.ruleLabel}>Verbs</span>
          <div className={classes.pillRow}>
            {rule.verbs!.map(v => {
              const tone = verbTone(t, v);
              return (
                <span key={v} className={classes.pill} style={{ color: tone.color, backgroundColor: tone.bg }}>{v}</span>
              );
            })}
          </div>
        </div>
      )}
      {(rule.resourceNames ?? []).length > 0 && (
        <div className={classes.ruleGroup}>
          <span className={classes.ruleLabel}>Resource Names</span>
          <div className={classes.pillRow}>
            {rule.resourceNames!.map(n => (
              <span key={n} className={`${classes.pill} ${classes.resourceNamePill}`}>{n}</span>
            ))}
          </div>
        </div>
      )}
      {(rule.nonResourceURLs ?? []).length > 0 && (
        <div className={classes.ruleGroup}>
          <span className={classes.ruleLabel}>Non-resource URLs</span>
          <div className={classes.pillRow}>
            {rule.nonResourceURLs!.map(u => (
              <span key={u} className={classes.pill}>{u}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RulesSection({ rules, classes, t }: { rules: RawPolicyRule[]; classes: ReturnType<typeof useStyles>; t: HangarTokens }) {
  return (
    <>
      <div className={classes.section}>
        <div className={classes.sectionHead}>
          <span className={classes.sectionIcon}><SecurityIcon fontSize="small" /></span>
          <Typography className={classes.sectionTitle}>Overview</Typography>
        </div>
        <div className={classes.kvRow}>
          <div className={classes.kv}>
            <span className={classes.kvLabel}>Rules</span>
            <span className={classes.kvValue}>{rules.length}</span>
          </div>
        </div>
      </div>
      <div className={classes.section}>
        <div className={classes.sectionHead}>
          <span className={classes.sectionIcon}><SecurityIcon fontSize="small" /></span>
          <Typography className={classes.sectionTitle}>Rules ({rules.length})</Typography>
        </div>
        {rules.length === 0 ? (
          <Typography className={classes.note}>This role grants no rules.</Typography>
        ) : (
          rules.map((rule, i) => <RuleCard key={i} rule={rule} classes={classes} t={t} />)
        )}
      </div>
    </>
  );
}

function findRoleRef(related: K8sResourceRef[], roleRef: RawRoleRef | undefined): K8sResourceRef | undefined {
  if (!roleRef?.name || !roleRef.kind) return undefined;
  return related.find(r => r.kind === roleRef.kind && r.name === roleRef.name);
}

export function RbacDetailView({ resource, related }: { resource: K8sResourceRef; related: K8sResourceRef[] }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });

  if (resource.kind === 'Role' || resource.kind === 'ClusterRole') {
    const rules = (resource.raw as RawRoleLike)?.rules ?? [];
    return (
      <div className={classes.wrap}>
        <RulesSection rules={rules} classes={classes} t={t} />
      </div>
    );
  }

  // RoleBinding / ClusterRoleBinding
  const binding = resource.raw as RawBindingLike;
  const subjects = binding.subjects ?? [];
  const roleRef = binding.roleRef;
  const resolvedRole = findRoleRef(related, roleRef);
  const resolvedRules = resolvedRole ? (resolvedRole.raw as RawRoleLike)?.rules ?? [] : undefined;

  return (
    <div className={classes.wrap}>
      <div className={classes.section}>
        <div className={classes.sectionHead}>
          <span className={classes.sectionIcon}><PeopleIcon fontSize="small" /></span>
          <Typography className={classes.sectionTitle}>Bindings (1)</Typography>
        </div>
        <div className={classes.bindingCard}>
          <div className={classes.bindingHead}>
            <span className={classes.kindChip}>{resource.kind}</span>
            <span className={classes.bindingName}>{resource.name}</span>
            <span className={classes.bindingMeta}>
              granted to {subjects.length} subject{subjects.length === 1 ? '' : 's'}
            </span>
          </div>
          {subjects.length === 0 ? (
            <Typography className={classes.note}>No subjects listed on this binding.</Typography>
          ) : (
            subjects.map((s, i) => (
              <span key={i} className={classes.subjectRow}>
                <span className={classes.subjectKind}>{(s.kind ?? 'subject').toLowerCase()}:</span>
                <span className={classes.subjectName}>{s.name ?? 'unnamed'}</span>
                {s.namespace && <span className={classes.subjectNs}>({s.namespace})</span>}
              </span>
            ))
          )}
        </div>
      </div>

      {roleRef && (
        <div className={classes.section}>
          <div className={classes.sectionHead}>
            <span className={classes.sectionIcon}><SecurityIcon fontSize="small" /></span>
            <Typography className={classes.sectionTitle}>Grants ({roleRef.kind} — {roleRef.name})</Typography>
          </div>
          {resolvedRules ? (
            <RulesSection rules={resolvedRules} classes={classes} t={t} />
          ) : (
            <Typography className={classes.note}>
              Couldn't resolve {roleRef.kind} "{roleRef.name}" - it isn't in Tower's fetched resources yet (may need a
              refresh, or Tower's RBAC read grant doesn't cover it).
            </Typography>
          )}
        </div>
      )}
    </div>
  );
}
