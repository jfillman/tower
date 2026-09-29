import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import PeopleIcon from '@material-ui/icons/People';
import SecurityIcon from '@material-ui/icons/Security';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';

const RBAC_KINDS = ["Role", "ClusterRole", "RoleBinding", "ClusterRoleBinding"];
function verbTone(t, verb) {
  if (["get", "list", "watch"].includes(verb)) return { color: t.good, bg: t.goodSoft };
  if (["delete", "deletecollection", "escalate", "bind", "impersonate"].includes(verb)) return { color: t.bad, bg: t.badSoft };
  return { color: t.amberInk, bg: t.amberSoft };
}
const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 16 },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionHead: { display: "flex", alignItems: "center", gap: 8 },
  sectionIcon: { display: "flex", color: ({ t }) => t.sky },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  bindingCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 14px",
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt
  },
  bindingHead: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  kindChip: {
    fontFamily: fontMono,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "2px 8px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky
  },
  bindingName: { fontFamily: fontMono, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  bindingMeta: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  subjectRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 20,
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    fontFamily: fontMono,
    fontSize: 11.5,
    alignSelf: "flex-start"
  },
  subjectKind: { color: ({ t }) => t.textFaint },
  subjectName: { color: ({ t }) => t.sky, fontWeight: 600 },
  subjectNs: { color: ({ t }) => t.textFaint },
  kvRow: { display: "flex", gap: 20 },
  kv: { display: "flex", flexDirection: "column", gap: 2 },
  kvLabel: { fontFamily: fontMono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: ({ t }) => t.textFaint },
  kvValue: { fontFamily: fontMono, fontSize: 15, fontWeight: 700, color: ({ t }) => t.textHi },
  ruleCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panel
  },
  ruleGroup: { display: "flex", flexDirection: "column", gap: 5 },
  ruleLabel: { fontFamily: fontMono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: ({ t }) => t.textFaint },
  pillRow: { display: "flex", gap: 5, flexWrap: "wrap" },
  pill: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 9px",
    borderRadius: 5,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi
  },
  resourceNamePill: { backgroundColor: ({ t }) => t.skySoft, color: ({ t }) => t.sky },
  note: { fontSize: 12, fontStyle: "italic", color: ({ t }) => t.textFaint }
}));
function RuleCard({ rule, classes, t }) {
  const groups = (rule.apiGroups ?? []).map((g) => g === "" ? "core" : g);
  return /* @__PURE__ */ jsxs("div", { className: classes.ruleCard, children: [
    groups.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.ruleGroup, children: [
      /* @__PURE__ */ jsx("span", { className: classes.ruleLabel, children: "API Groups" }),
      /* @__PURE__ */ jsx("div", { className: classes.pillRow, children: groups.map((g) => /* @__PURE__ */ jsx("span", { className: classes.pill, children: g }, g)) })
    ] }),
    (rule.resources ?? []).length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.ruleGroup, children: [
      /* @__PURE__ */ jsx("span", { className: classes.ruleLabel, children: "Resources" }),
      /* @__PURE__ */ jsx("div", { className: classes.pillRow, children: rule.resources.map((r) => /* @__PURE__ */ jsx("span", { className: classes.pill, children: r }, r)) })
    ] }),
    (rule.verbs ?? []).length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.ruleGroup, children: [
      /* @__PURE__ */ jsx("span", { className: classes.ruleLabel, children: "Verbs" }),
      /* @__PURE__ */ jsx("div", { className: classes.pillRow, children: rule.verbs.map((v) => {
        const tone = verbTone(t, v);
        return /* @__PURE__ */ jsx("span", { className: classes.pill, style: { color: tone.color, backgroundColor: tone.bg }, children: v }, v);
      }) })
    ] }),
    (rule.resourceNames ?? []).length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.ruleGroup, children: [
      /* @__PURE__ */ jsx("span", { className: classes.ruleLabel, children: "Resource Names" }),
      /* @__PURE__ */ jsx("div", { className: classes.pillRow, children: rule.resourceNames.map((n) => /* @__PURE__ */ jsx("span", { className: `${classes.pill} ${classes.resourceNamePill}`, children: n }, n)) })
    ] }),
    (rule.nonResourceURLs ?? []).length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.ruleGroup, children: [
      /* @__PURE__ */ jsx("span", { className: classes.ruleLabel, children: "Non-resource URLs" }),
      /* @__PURE__ */ jsx("div", { className: classes.pillRow, children: rule.nonResourceURLs.map((u) => /* @__PURE__ */ jsx("span", { className: classes.pill, children: u }, u)) })
    ] })
  ] });
}
function RulesSection({ rules, classes, t }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.sectionIcon, children: /* @__PURE__ */ jsx(SecurityIcon, { fontSize: "small" }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Overview" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: classes.kvRow, children: /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Rules" }),
        /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: rules.length })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.sectionIcon, children: /* @__PURE__ */ jsx(SecurityIcon, { fontSize: "small" }) }),
        /* @__PURE__ */ jsxs(Typography, { className: classes.sectionTitle, children: [
          "Rules (",
          rules.length,
          ")"
        ] })
      ] }),
      rules.length === 0 ? /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "This role grants no rules." }) : rules.map((rule, i) => /* @__PURE__ */ jsx(RuleCard, { rule, classes, t }, i))
    ] })
  ] });
}
function findRoleRef(related, roleRef) {
  if (!roleRef?.name || !roleRef.kind) return void 0;
  return related.find((r) => r.kind === roleRef.kind && r.name === roleRef.name);
}
function RbacDetailView({ resource, related }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (resource.kind === "Role" || resource.kind === "ClusterRole") {
    const rules = resource.raw?.rules ?? [];
    return /* @__PURE__ */ jsx("div", { className: classes.wrap, children: /* @__PURE__ */ jsx(RulesSection, { rules, classes, t }) });
  }
  const binding = resource.raw;
  const subjects = binding.subjects ?? [];
  const roleRef = binding.roleRef;
  const resolvedRole = findRoleRef(related, roleRef);
  const resolvedRules = resolvedRole ? resolvedRole.raw?.rules ?? [] : void 0;
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.sectionIcon, children: /* @__PURE__ */ jsx(PeopleIcon, { fontSize: "small" }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Bindings (1)" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.bindingCard, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.bindingHead, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kindChip, children: resource.kind }),
          /* @__PURE__ */ jsx("span", { className: classes.bindingName, children: resource.name }),
          /* @__PURE__ */ jsxs("span", { className: classes.bindingMeta, children: [
            "granted to ",
            subjects.length,
            " subject",
            subjects.length === 1 ? "" : "s"
          ] })
        ] }),
        subjects.length === 0 ? /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No subjects listed on this binding." }) : subjects.map((s, i) => /* @__PURE__ */ jsxs("span", { className: classes.subjectRow, children: [
          /* @__PURE__ */ jsxs("span", { className: classes.subjectKind, children: [
            (s.kind ?? "subject").toLowerCase(),
            ":"
          ] }),
          /* @__PURE__ */ jsx("span", { className: classes.subjectName, children: s.name ?? "unnamed" }),
          s.namespace && /* @__PURE__ */ jsxs("span", { className: classes.subjectNs, children: [
            "(",
            s.namespace,
            ")"
          ] })
        ] }, i))
      ] })
    ] }),
    roleRef && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.sectionIcon, children: /* @__PURE__ */ jsx(SecurityIcon, { fontSize: "small" }) }),
        /* @__PURE__ */ jsxs(Typography, { className: classes.sectionTitle, children: [
          "Grants (",
          roleRef.kind,
          " \u2014 ",
          roleRef.name,
          ")"
        ] })
      ] }),
      resolvedRules ? /* @__PURE__ */ jsx(RulesSection, { rules: resolvedRules, classes, t }) : /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
        "Couldn't resolve ",
        roleRef.kind,
        ' "',
        roleRef.name,
        `" - it isn't in Tower's fetched resources yet (may need a refresh, or Tower's RBAC read grant doesn't cover it).`
      ] })
    ] })
  ] });
}

export { RBAC_KINDS, RbacDetailView };
//# sourceMappingURL=RbacDetailView.esm.js.map
