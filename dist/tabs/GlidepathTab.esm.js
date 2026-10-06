import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Switch from '@material-ui/core/Switch';
import TextField from '@material-ui/core/TextField';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import Link from '@material-ui/core/Link';
import IconButton from '@material-ui/core/IconButton';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import { dump, load } from 'js-yaml';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { TowerEmptyState } from '../TowerEmptyState.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';
import { useCicdConfig, useSubmitCicdConfigChange } from '../useConfigData.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { validateYamlBlock, YamlBlockEditor } from '../YamlBlockEditor.esm.js';
import { PageHeader, Subtabs } from '../ui/index.esm.js';
import { PendingPanel } from '../ui/PendingPanel.esm.js';
import { deepEqual } from '../deepEqual.esm.js';
import { CICD_TOP_LEVEL_FIELDS } from '../types.esm.js';

const BUILD_AGENTS = ["nodejs-18", "nodejs-20", "nodejs-22", "openjdk-17", "openjdk-21", "python-3.11", "go-1.22"];
const VOLUME_SIZES = ["small", "medium", "large", "xlarge"];
function splitCsv(text) {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}
function joinCsv(arr) {
  return Array.isArray(arr) ? arr.map(String).join(", ") : "";
}
function safeYamlDump(value) {
  try {
    return dump(value ?? {}, { lineWidth: -1 });
  } catch {
    return "";
  }
}
function safeYamlLoad(text) {
  try {
    const parsed = load(text.trim().length === 0 ? "{}" : text);
    return parsed ?? {};
  } catch {
    return void 0;
  }
}
function buildFormFromValues(values) {
  const deploy = values.deploy ?? {};
  const build = values.build ?? {};
  const unitTest = build.unitTest ?? {};
  const cache = build.cache ?? {};
  const sourceVolume = build.sourceVolume ?? {};
  const test = values.test ?? {};
  const eph = values.ephemeralEnvironments ?? {};
  const branch = eph.branch ?? {};
  const pullRequest = eph.pullRequest ?? {};
  const gov = values.governance ?? {};
  const notif = values.notifications ?? {};
  const slack = notif.slack ?? {};
  const backstageNotif = notif.backstage ?? {};
  const secrets = Array.isArray(values.secrets) ? values.secrets : [];
  return {
    usesEnvironments: Array.isArray(deploy.environments) && deploy.environments.length > 0,
    lowerEnvironments: joinCsv(deploy.lowerEnvironments ?? ["dev"]),
    upperEnvironmentsRaw: safeYamlDump(deploy.upperEnvironments ?? []),
    promotionOrder: joinCsv(deploy.promotionOrder ?? []),
    // Argo Rollouts is the only implemented strategy (2026-09-24) - a legacy
    // `strategy: deployment` in the file is normalized to it on the next save.
    strategy: "rollout",
    buildAgent: BUILD_AGENTS.includes(build.agent) ? build.agent : "nodejs-20",
    buildScriptEnabled: typeof build.script === "string",
    buildScript: typeof build.script === "string" ? build.script : "",
    // `containerfile` is the schema's current key; `dockerfile` is the legacy name
    // (renamed 2026-09-22) - read as a fallback so an un-migrated file still shows
    // its real path, but only ever written back as `containerfile`.
    buildContainerfile: [build.containerfile, build.dockerfile].find((v) => typeof v === "string") ?? "./Containerfile",
    buildUnitTestEnabled: unitTest.enabled !== false,
    buildUnitTestCommand: typeof unitTest.command === "string" ? unitTest.command : "./test.sh",
    buildSonar: Boolean(build.sonar),
    buildCacheEnabled: Boolean(cache.enabled),
    buildCacheSize: VOLUME_SIZES.includes(cache.size) ? cache.size : "small",
    buildSourceVolumeSize: VOLUME_SIZES.includes(sourceVolume.size) ? sourceVolume.size : "small",
    testEnabled: test.enabled !== false,
    testName: typeof test.name === "string" ? test.name : "",
    branchEnabled: Boolean(branch.enabled),
    branchPatterns: joinCsv(branch.patterns ?? ["preview/*"]),
    prEnabled: Boolean(pullRequest.enabled),
    prLabels: joinCsv(pullRequest.labels ?? ["preview"]),
    ttl: typeof eph.ttl === "string" ? eph.ttl : "5d",
    sast: Boolean(gov.sast),
    imageScan: Boolean(gov.imageScan),
    policyCheck: Boolean(gov.policyCheck),
    sbom: Boolean(gov.sbom),
    allowedCommitSigners: joinCsv(gov.allowedCommitSigners ?? []),
    slackEnabled: Boolean(slack.enabled),
    slackChannel: typeof slack.channel === "string" ? slack.channel : "",
    slackScanResults: Boolean(slack.scanResults),
    backstageEnabled: Boolean(backstageNotif.enabled),
    secrets: secrets.map((s) => ({ name: s.name ?? "", key: s.key ?? "" })),
    pipelinesRaw: safeYamlDump(values.pipelines ?? {})
  };
}
function emptyDefaultFor(key) {
  switch (key) {
    case "build":
      return {
        containerfile: "./Containerfile",
        unitTest: { enabled: true, command: "./test.sh" },
        sonar: false,
        cache: { enabled: false, size: "small" },
        sourceVolume: { size: "small" }
      };
    case "test":
      return { enabled: true };
    case "deploy":
      return { lowerEnvironments: ["dev"], upperEnvironments: [], strategy: "rollout", promotionOrder: [] };
    case "ephemeralEnvironments":
      return {
        branch: { enabled: false, patterns: ["preview/*"] },
        pullRequest: { enabled: false, labels: ["preview"] },
        ttl: "5d"
      };
    case "governance":
      return { sast: false, imageScan: false, policyCheck: false, sbom: false, allowedCommitSigners: [] };
    case "notifications":
      return { slack: { enabled: false, channel: "", scanResults: false }, backstage: { enabled: false } };
    case "secrets":
      return [];
    case "pipelines":
      return {};
    default:
      return {};
  }
}
function buildCandidateValues(form, originalValues) {
  const { dockerfile: _legacyDockerfile, script: _script, ...originalBuild } = originalValues.build ?? {};
  const originalDeploy = originalValues.deploy ?? {};
  const usesEnvironments = Array.isArray(originalDeploy.environments) && originalDeploy.environments.length > 0;
  return {
    build: {
      ...originalBuild,
      agent: form.buildAgent,
      ...form.buildScriptEnabled ? { script: form.buildScript } : {},
      containerfile: form.buildContainerfile,
      unitTest: { enabled: form.buildUnitTestEnabled, command: form.buildUnitTestCommand },
      sonar: form.buildSonar,
      cache: { enabled: form.buildCacheEnabled, size: form.buildCacheSize },
      sourceVolume: { size: form.buildSourceVolumeSize }
    },
    test: { enabled: form.testEnabled, ...form.testName.trim() ? { name: form.testName.trim() } : {} },
    deploy: usesEnvironments ? (
      // deploy.environments owns the environment list. Writing lowerEnvironments/upperEnvironments/
      // promotionOrder next to it would make the cicd.yaml fail the schema ("not both"), so only
      // the fields this form still edits are written.
      { ...originalDeploy, strategy: form.strategy }
    ) : {
      // The whole `deploy` section is replaced on save, so keep keys this form has no field for:
      // `target` and the per-target blocks (`lambda`, `ecs`, `azureContainerApps`). Dropping them
      // silently moved a function back to the Kubernetes target.
      ...originalDeploy,
      lowerEnvironments: splitCsv(form.lowerEnvironments),
      upperEnvironments: safeYamlLoad(form.upperEnvironmentsRaw) ?? [],
      strategy: form.strategy,
      promotionOrder: splitCsv(form.promotionOrder)
    },
    ephemeralEnvironments: {
      branch: { enabled: form.branchEnabled, patterns: splitCsv(form.branchPatterns) },
      pullRequest: { enabled: form.prEnabled, labels: splitCsv(form.prLabels) },
      ttl: form.ttl
    },
    governance: {
      sast: form.sast,
      imageScan: form.imageScan,
      policyCheck: form.policyCheck,
      sbom: form.sbom,
      allowedCommitSigners: splitCsv(form.allowedCommitSigners)
    },
    notifications: {
      slack: { enabled: form.slackEnabled, channel: form.slackChannel, scanResults: form.slackScanResults },
      backstage: { enabled: form.backstageEnabled }
    },
    secrets: form.secrets.filter((s) => s.name.trim().length > 0).map((s) => s.key.trim() ? { name: s.name.trim(), key: s.key.trim() } : { name: s.name.trim() }),
    pipelines: safeYamlLoad(form.pipelinesRaw) ?? {}
  };
}
function buildCicdPatch(form, originalValues) {
  const candidate = buildCandidateValues(form, originalValues);
  const patch = {};
  for (const key of CICD_TOP_LEVEL_FIELDS) {
    const baseline = originalValues[key] ?? emptyDefaultFor(key);
    if (!deepEqual(candidate[key], baseline)) {
      patch[key] = candidate[key];
    }
  }
  return patch;
}
const useStyles = makeStyles(() => ({
  root: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerTitle: { display: "flex", alignItems: "center", gap: 10 },
  title: {
    fontFamily: fontDisplay,
    fontSize: 20,
    fontWeight: 600,
    color: ({ t }) => t.textHi
  },
  section: {
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 6,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    backgroundColor: ({ t }) => t.panel
  },
  sectionTitle: {
    fontFamily: fontDisplay,
    fontSize: 14,
    fontWeight: 600,
    color: ({ t }) => t.textHi
  },
  sectionHint: { fontSize: 12, color: ({ t }) => t.textLo },
  row: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  switchRow: { display: "flex", alignItems: "center", gap: 8 },
  switchLabel: { fontSize: 13, color: ({ t }) => t.textHi },
  govCaption: { fontSize: 11, color: ({ t }) => t.textLo, fontStyle: "italic" },
  secretRow: { display: "flex", alignItems: "center", gap: 8 },
  submitBar: { display: "flex", alignItems: "center", gap: 12 },
  submitBtn: {
    fontFamily: fontDisplay,
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 18px",
    borderRadius: 4,
    border: "none",
    cursor: "pointer",
    backgroundColor: ({ t }) => t.amber,
    color: "#1a1200",
    "&:disabled": { opacity: 0.5, cursor: "default" }
  },
  resultLink: { fontFamily: fontMono, fontSize: 12 },
  rawView: {
    fontFamily: fontMono,
    fontSize: 11,
    whiteSpace: "pre-wrap",
    color: ({ t }) => t.textLo,
    maxHeight: 320,
    overflow: "auto",
    padding: 10,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 4
  }
}));
const GLIDEPATH_TABS = [
  { id: "build", label: "Build" },
  { id: "test", label: "Test" },
  { id: "deploy", label: "Deploy" },
  { id: "preview", label: "Preview environments" },
  { id: "governance", label: "Governance" },
  { id: "notifications", label: "Notifications" },
  { id: "secrets", label: "Secrets" },
  { id: "pipelines", label: "Pipelines" },
  { id: "advanced", label: "Advanced" }
];
const TAB_OF_FIELD = {
  build: "build",
  test: "test",
  deploy: "deploy",
  ephemeralEnvironments: "preview",
  governance: "governance",
  notifications: "notifications",
  secrets: "secrets",
  pipelines: "pipelines"
};
function GlidepathTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { owner, appName, loading: contextLoading, error: contextError } = useReleaseContext();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const target = owner && appName ? { owner, appName } : void 0;
  const cicd = useCicdConfig(target, refreshNonce);
  const submitCicd = useSubmitCicdConfigChange();
  const [form, setForm] = useState(void 0);
  const [tab, setTab] = useState("build");
  useEffect(() => {
    if (cicd.data) setForm(buildFormFromValues(cicd.data.values));
  }, [cicd.data]);
  const patch = useMemo(
    () => form && cicd.data ? buildCicdPatch(form, cicd.data.values) : {},
    [form, cicd.data]
  );
  const dirty = Object.keys(patch).length > 0;
  const yamlBlocksValid = useMemo(() => {
    if (!form) return true;
    return [form.upperEnvironmentsRaw, form.pipelinesRaw].every(
      (text) => validateYamlBlock(text).valid
    );
  }, [form]);
  const dirtyTabs = new Set(Object.keys(patch).map((k) => TAB_OF_FIELD[k] ?? "advanced"));
  const lines = Object.keys(patch).map((k) => ({ title: `Update ${k}`, detail: `cicd.yaml \u203A ${k}` }));
  const problems = yamlBlocksValid ? [] : ["A YAML block (deploy environments or pipelines) is not valid YAML. Fix it before opening the pull request."];
  if (contextLoading) return /* @__PURE__ */ jsx(Progress, {});
  if (contextError) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(contextError) });
  if (!owner || !appName) {
    return /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "Can't resolve this app's source repo",
        description: "Glidepath needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which repo's cicd.yaml to read."
      }
    );
  }
  if (cicd.loading || !form) return /* @__PURE__ */ jsx(Progress, {});
  if (cicd.error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(cicd.error) });
  const summary = [];
  for (const key of Object.keys(patch)) summary.push(`updated \`${key}\``);
  async function handleSubmit() {
    if (!owner || !appName || !yamlBlocksValid || !dirty) return;
    await submitCicd.submit({ owner, appName, patch, summary });
    setRefreshNonce((n) => n + 1);
  }
  function updateSecret(i, field, value) {
    setForm((f) => {
      if (!f) return f;
      const secrets = f.secrets.slice();
      secrets[i] = { ...secrets[i], [field]: value };
      return { ...f, secrets };
    });
  }
  return /* @__PURE__ */ jsxs("div", { className: classes.root, children: [
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: "Glidepath",
        subtitle: `${appName}'s cicd.yaml: the settings of its CI/CD engine. Every change opens a pull request on the ${appName} repo; nothing is committed directly.`,
        actions: /* @__PURE__ */ jsx(RefreshButton, { onClick: () => setRefreshNonce((n) => n + 1), label: "Refresh" })
      }
    ),
    /* @__PURE__ */ jsx(Subtabs, { label: "Glidepath sections", value: tab, onChange: setTab, tabs: GLIDEPATH_TABS.map((x) => ({ ...x, marked: dirtyTabs.has(x.id) })) }),
    tab === "build" && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Build" }),
      /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx(Select, { value: form.buildAgent, onChange: (e) => setForm((f) => f ? { ...f, buildAgent: e.target.value } : f), children: BUILD_AGENTS.map((a) => /* @__PURE__ */ jsx(MenuItem, { value: a, children: a }, a)) }),
        /* @__PURE__ */ jsx(
          TextField,
          {
            label: "Containerfile path",
            value: form.buildContainerfile,
            onChange: (e) => setForm((f) => f ? { ...f, buildContainerfile: e.target.value } : f),
            size: "small"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: form.buildScriptEnabled,
            onChange: (e) => setForm((f) => f ? { ...f, buildScriptEnabled: e.target.checked } : f)
          }
        ),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Run a build script before packaging" })
      ] }),
      form.buildScriptEnabled ? /* @__PURE__ */ jsx(
        TextField,
        {
          label: "Build script (bash)",
          value: form.buildScript,
          onChange: (e) => setForm((f) => f ? { ...f, buildScript: e.target.value } : f),
          fullWidth: true,
          multiline: true,
          minRows: 3,
          size: "small"
        }
      ) : /* @__PURE__ */ jsxs(Typography, { className: classes.sectionHint, children: [
        "Off - the whole build happens inside ",
        form.buildContainerfile,
        " (kaniko builds it directly)."
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: form.buildUnitTestEnabled,
            onChange: (e) => setForm((f) => f ? { ...f, buildUnitTestEnabled: e.target.checked } : f)
          }
        ),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Unit tests" }),
        form.buildUnitTestEnabled && /* @__PURE__ */ jsx(
          TextField,
          {
            label: "Command",
            value: form.buildUnitTestCommand,
            onChange: (e) => setForm((f) => f ? { ...f, buildUnitTestCommand: e.target.value } : f),
            size: "small"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(Switch, { checked: form.buildSonar, onChange: (e) => setForm((f) => f ? { ...f, buildSonar: e.target.checked } : f) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Sonar" }),
        /* @__PURE__ */ jsx(Typography, { className: classes.govCaption, children: "Reserved - no effect yet." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: form.buildCacheEnabled,
            onChange: (e) => setForm((f) => f ? { ...f, buildCacheEnabled: e.target.checked } : f)
          }
        ),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Persistent dependency cache" }),
        form.buildCacheEnabled && /* @__PURE__ */ jsx(
          Select,
          {
            value: form.buildCacheSize,
            onChange: (e) => setForm((f) => f ? { ...f, buildCacheSize: e.target.value } : f),
            children: VOLUME_SIZES.map((s) => /* @__PURE__ */ jsx(MenuItem, { value: s, children: s }, s))
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Source workspace size" }),
        /* @__PURE__ */ jsx(
          Select,
          {
            value: form.buildSourceVolumeSize,
            onChange: (e) => setForm((f) => f ? { ...f, buildSourceVolumeSize: e.target.value } : f),
            children: VOLUME_SIZES.map((s) => /* @__PURE__ */ jsx(MenuItem, { value: s, children: s }, s))
          }
        )
      ] })
    ] }),
    tab === "test" && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Test" }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(Switch, { checked: form.testEnabled, onChange: (e) => setForm((f) => f ? { ...f, testEnabled: e.target.checked } : f) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Enabled" })
      ] }),
      form.testEnabled && /* @__PURE__ */ jsx(
        TextField,
        {
          label: "TestWorkflow name (<name>.yaml under platform/ or glidepath/)",
          value: form.testName,
          onChange: (e) => setForm((f) => f ? { ...f, testName: e.target.value } : f),
          size: "small"
        }
      )
    ] }),
    tab === "deploy" && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Deploy" }),
      form.usesEnvironments ? /* @__PURE__ */ jsx(Typography, { className: classes.govCaption, children: "This app declares its environments in deploy.environments, so the lists below are not used. See the Environments tab; editing them from Tower comes next. Until then change deploy.environments in cicd.yaml directly." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: classes.row, children: /* @__PURE__ */ jsx(
          TextField,
          {
            label: "Lower environments (comma-separated)",
            value: form.lowerEnvironments,
            onChange: (e) => setForm((f) => f ? { ...f, lowerEnvironments: e.target.value } : f),
            fullWidth: true,
            size: "small"
          }
        ) }),
        /* @__PURE__ */ jsx("div", { className: classes.row, children: /* @__PURE__ */ jsx(
          TextField,
          {
            label: "Promotion order (comma-separated, in order)",
            helperText: "Pure metadata - Tower's own Release Matrix reads this back; no Glidepath Task enforces it.",
            value: form.promotionOrder,
            onChange: (e) => setForm((f) => f ? { ...f, promotionOrder: e.target.value } : f),
            fullWidth: true,
            size: "small"
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx(Select, { value: form.strategy, disabled: true, children: /* @__PURE__ */ jsx(MenuItem, { value: "rollout", children: "rollout" }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.govCaption, children: "Argo Rollouts is the only supported deploy strategy." })
      ] }),
      !form.usesEnvironments && /* @__PURE__ */ jsx(
        YamlBlockEditor,
        {
          label: "upperEnvironments (name, or {name, cluster})",
          value: form.upperEnvironmentsRaw,
          onChange: (text) => setForm((f) => f ? { ...f, upperEnvironmentsRaw: text } : f),
          rows: 4
        }
      )
    ] }),
    tab === "preview" && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Ephemeral Environments" }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: form.branchEnabled,
            onChange: (e) => setForm((f) => f ? { ...f, branchEnabled: e.target.checked } : f)
          }
        ),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Branch-triggered preview envs" })
      ] }),
      form.branchEnabled && /* @__PURE__ */ jsx(
        TextField,
        {
          label: "Branch patterns (comma-separated)",
          value: form.branchPatterns,
          onChange: (e) => setForm((f) => f ? { ...f, branchPatterns: e.target.value } : f),
          fullWidth: true,
          size: "small"
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: form.prEnabled,
            onChange: (e) => setForm((f) => f ? { ...f, prEnabled: e.target.checked } : f)
          }
        ),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "PR-label-triggered preview envs" })
      ] }),
      form.prEnabled && /* @__PURE__ */ jsx(
        TextField,
        {
          label: "PR labels (comma-separated)",
          value: form.prLabels,
          onChange: (e) => setForm((f) => f ? { ...f, prLabels: e.target.value } : f),
          fullWidth: true,
          size: "small"
        }
      ),
      /* @__PURE__ */ jsx(
        TextField,
        {
          label: "TTL (e.g. 5d, 12h)",
          value: form.ttl,
          onChange: (e) => setForm((f) => f ? { ...f, ttl: e.target.value } : f),
          size: "small"
        }
      )
    ] }),
    tab === "governance" && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Governance" }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.govCaption, children: [
        "Pre-flight checks only. The release-blocking gate on ",
        appName,
        "'s release PR always runs regardless of these settings."
      ] }),
      [
        ["sast", "SAST (Semgrep)"],
        ["imageScan", "Image scan (Trivy)"],
        ["policyCheck", "Commit-signature policy check"],
        ["sbom", "SBOM attestation"]
      ].map(([key, label]) => /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: form[key],
            onChange: (e) => setForm((f) => f ? { ...f, [key]: e.target.checked } : f)
          }
        ),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: label })
      ] }, key)),
      /* @__PURE__ */ jsx(
        TextField,
        {
          label: "Allowed commit signers (comma-separated emails)",
          value: form.allowedCommitSigners,
          onChange: (e) => setForm((f) => f ? { ...f, allowedCommitSigners: e.target.value } : f),
          fullWidth: true,
          size: "small"
        }
      )
    ] }),
    tab === "notifications" && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Notifications" }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: form.slackEnabled,
            onChange: (e) => setForm((f) => f ? { ...f, slackEnabled: e.target.checked } : f)
          }
        ),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Slack" })
      ] }),
      form.slackEnabled && /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx(
          TextField,
          {
            label: "Slack channel",
            value: form.slackChannel,
            onChange: (e) => setForm((f) => f ? { ...f, slackChannel: e.target.value } : f),
            size: "small"
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
          /* @__PURE__ */ jsx(
            Switch,
            {
              checked: form.slackScanResults,
              onChange: (e) => setForm((f) => f ? { ...f, slackScanResults: e.target.checked } : f)
            }
          ),
          /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Include scan results" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: form.backstageEnabled,
            onChange: (e) => setForm((f) => f ? { ...f, backstageEnabled: e.target.checked } : f)
          }
        ),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Backstage notifications" })
      ] })
    ] }),
    tab === "secrets" && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Secrets" }),
      form.secrets.map((s, i) => /* @__PURE__ */ jsxs("div", { className: classes.secretRow, children: [
        /* @__PURE__ */ jsx(
          TextField,
          {
            label: "name",
            value: s.name,
            onChange: (e) => updateSecret(i, "name", e.target.value),
            size: "small"
          }
        ),
        /* @__PURE__ */ jsx(
          TextField,
          {
            label: "key (optional)",
            value: s.key,
            onChange: (e) => updateSecret(i, "key", e.target.value),
            size: "small"
          }
        ),
        /* @__PURE__ */ jsx(
          IconButton,
          {
            size: "small",
            onClick: () => setForm((f) => f ? { ...f, secrets: f.secrets.filter((_, j) => j !== i) } : f),
            children: /* @__PURE__ */ jsx(DeleteIcon, { fontSize: "small" })
          }
        )
      ] }, i)),
      /* @__PURE__ */ jsx(
        IconButton,
        {
          size: "small",
          onClick: () => setForm((f) => f ? { ...f, secrets: [...f.secrets, { name: "", key: "" }] } : f),
          children: /* @__PURE__ */ jsx(AddIcon, { fontSize: "small" })
        }
      )
    ] }),
    tab === "pipelines" && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Pipelines" }),
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionHint, children: "Raw YAML - named-flow map (trigger + steps, or the legacy list form)." }),
      /* @__PURE__ */ jsx(
        YamlBlockEditor,
        {
          label: "pipelines",
          value: form.pipelinesRaw,
          onChange: (text) => setForm((f) => f ? { ...f, pipelinesRaw: text } : f),
          rows: 10
        }
      )
    ] }),
    tab === "advanced" && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Committed cicd.yaml" }),
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionHint, children: "The file as it is on the default branch, read only. Staged changes are not in it until their pull request merges." }),
      /* @__PURE__ */ jsx("pre", { className: classes.rawView, children: cicd.data?.raw || "(no cicd.yaml committed yet)" })
    ] }),
    /* @__PURE__ */ jsxs(
      PendingPanel,
      {
        heading: "Pending changes to cicd.yaml",
        stick: "bottom",
        lines,
        problems,
        emptyText: "Nothing staged. Edit a field above and it is listed here.",
        busy: submitCicd.loading,
        busyLabel: "Opening pull request\u2026",
        submitLabel: "Open pull request",
        onDiscard: () => cicd.data && setForm(buildFormFromValues(cicd.data.values)),
        onSubmit: handleSubmit,
        notes: ["cicd.yaml is one file per app, so these changes go in one pull request."],
        children: [
          submitCicd.result && /* @__PURE__ */ jsxs(Typography, { children: [
            submitCicd.result.alreadyOpen ? "A pull request for this exact change is already open: " : "Pull request opened: ",
            /* @__PURE__ */ jsx(Link, { className: classes.resultLink, href: submitCicd.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: submitCicd.result.prUrl })
          ] }),
          submitCicd.error && /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(submitCicd.error) })
        ]
      }
    )
  ] });
}

export { GlidepathTab, buildCandidateValues, buildFormFromValues };
//# sourceMappingURL=GlidepathTab.esm.js.map
