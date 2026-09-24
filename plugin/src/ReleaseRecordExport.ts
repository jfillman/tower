import { formatDateTime } from '../shared/format';
import { slugHue } from './PipelineRunList';
import { applyApprovalBonus, confidenceBreakdown, dedupeCommits, type ReleaseRecord } from './useReleaseRecords';
import type { ReleaseRecordHumanContext } from './useReleaseRecordPersistence';

// Test-results cap matches ReleaseRecordDetail.tsx's own live-page cap - kept in
// sync deliberately so the downloadable copy doesn't diverge from what's on screen.
const TEST_RESULTS_CAP = 8;

// Phase 1's export path (HANDOFF-tower-release-record.md's "Suggested build
// order" step 1: "Ship the Record sub-tab, HTML export, and browser
// print-to-PDF"). A literal serialization of the record into the fixed
// light "paper" theme the mockup artboard #3 settled on - deliberately NOT
// theme-aware like the rest of Tower (a printed/downloaded record is paper,
// not a live app view) - self-contained inline styles, same Google Fonts
// link tag packages/app/public/index.html already loads app-wide (so this
// looks identical whether opened straight from the app or as a
// double-clicked standalone file). v2 (a real one-click PDF via a headless-
// render backend route) is out of scope here - see the handoff's own "v2
// PDF" note.

function esc(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function shortDigest(digest?: string): string {
  if (!digest) return '';
  const hex = digest.replace(/^sha256:/, '');
  return `sha256:${hex.slice(0, 10)}…${hex.slice(-4)}`;
}

// Same colored-slug-chip language every other Tower surface uses for a
// release's real flow-correlation nickname (ImageTagPill.tsx's NicknameChip,
// reused everywhere except here since this document is plain HTML strings,
// not React) - inline styles rather than a stylesheet class since this is a
// self-contained, double-click-openable file with no external CSS of its own
// beyond the <style> block already in buildReleaseRecordHtml below.
function nicknameBadgeHtml(nickname: string | undefined): string {
  if (!nickname) return '';
  const hue = slugHue(nickname);
  return `<span style="display:inline-block; font-family:'IBM Plex Mono',monospace; font-size:10px; padding:1px 7px; border-radius:8px; border:1px solid hsl(${hue},65%,45%); color:hsl(${hue},65%,35%); background:hsla(${hue},65%,45%,0.12); margin-left:8px; vertical-align:middle;">${esc(nickname)}</span>`;
}

// Real developer summary/risk/verification content once a Release Record
// has been persisted and edited (Phase 2, HANDOFF-tower-release-record.md) -
// this export function only ever gets it if a caller has already fetched
// the persisted doc (ReleaseRecordDetail.tsx does, via
// useReleaseRecordDoc); undefined here just means "no persisted record (or
// no human context on it) to show," not "not implemented," so the fallback
// copy below reflects that instead of a stale "Phase 2 isn't built yet"
// claim.
function humanContextHtml(humanContext: ReleaseRecordHumanContext | undefined): string {
  if (!humanContext || (!humanContext.summary && !humanContext.risk && !humanContext.riskNotes && !humanContext.verificationNotes)) {
    return 'No developer summary, risk notes, or verification notes have been added to this release\'s Record yet - see the Record tab\'s Human Context band.';
  }
  const lines: string[] = [];
  if (humanContext.summary) lines.push(`<div><b>Summary:</b> ${esc(humanContext.summary)}</div>`);
  if (humanContext.risk) {
    lines.push(`<div><b>Risk:</b> ${esc(humanContext.risk)}${humanContext.riskNotes ? ` — ${esc(humanContext.riskNotes)}` : ''}</div>`);
  } else if (humanContext.riskNotes) {
    lines.push(`<div><b>Risk notes:</b> ${esc(humanContext.riskNotes)}</div>`);
  }
  if (humanContext.verificationNotes) lines.push(`<div><b>Verification:</b> ${esc(humanContext.verificationNotes)}</div>`);
  if (humanContext.approvals.length > 0) {
    lines.push(
      `<div><b>Approvals:</b> ${humanContext.approvals.map(a => esc(a.by) + (a.role ? ` (${esc(a.role)})` : '')).join(', ')}</div>`,
    );
  }
  if (humanContext.authoredBy) lines.push(`<div style="margin-top:6px; opacity:0.75;">— ${esc(humanContext.authoredBy)}</div>`);
  return lines.join('');
}

export function buildReleaseRecordHtml(record: ReleaseRecord, humanContext?: ReleaseRecordHumanContext): string {
  const rekor = record.provenance?.attestations.find(a => a.transparencyLog)?.transparencyLog;
  const verified = record.provenance?.attestations.some(a => a.verified) ?? false;
  const displayConfidence = applyApprovalBonus(record.confidence, humanContext?.approvals.length ?? 0);

  let changedItems: string;
  if (record.pullRequests.length > 0) {
    changedItems = record.pullRequests.map(pr => `<li>#${pr.number} ${esc(pr.title)}${pr.author ? ` — ${esc(pr.author)}` : ''}</li>`).join('');
  } else if (record.commits.length > 0) {
    changedItems = [
      '<li>No merged source PRs found in the window Tower has fetched — commits by environment:</li>',
      ...dedupeCommits(record.commits).map(c => `<li>${esc(c.env)}: ${esc(c.sha.slice(0, 7))}</li>`),
    ].join('');
  } else {
    changedItems = '<li>No merged source PRs found in the window Tower has fetched.</li>';
  }

  const builtItems: string[] = [];
  if (record.pipelineRuns.length > 0) {
    record.pipelineRuns.forEach(run => {
      const label = run.pipelineName ? `${run.pipelineName} run` : 'CI run';
      builtItems.push(`<li>${esc(label)} ${esc(run.name)} — ${esc(run.phase)}</li>`);
    });
  }
  if (record.securityScans.length > 0) {
    record.securityScans.forEach(scan => {
      const findings = scan.findingsSummary ? `<br/><span class="mono" style="font-size:10px;">${esc(scan.findingsSummary).replace(/\n/g, '<br/>')}</span>` : '';
      builtItems.push(`<li>${esc(scan.scanner.replace('-', ' '))}${scan.outcome ? `: ${esc(scan.outcome)}` : ''}${findings}</li>`);
    });
  }
  if (record.testResults.length > 0) {
    record.testResults
      .slice(0, TEST_RESULTS_CAP)
      .forEach(tr => builtItems.push(`<li>Test result ${esc(tr.taskName)}/${esc(tr.resultName)}: ${esc(tr.value)}</li>`));
    if (record.testResults.length > TEST_RESULTS_CAP) {
      builtItems.push(`<li>+${record.testResults.length - TEST_RESULTS_CAP} more test results</li>`);
    }
  }
  if (record.imageDigest) builtItems.push(`<li>Digest ${esc(shortDigest(record.imageDigest))}</li>`);
  builtItems.push(`<li>${verified ? 'Cosign verified' : 'Cosign verification not confirmed'}${rekor ? ` · Rekor #${rekor.logIndex}` : ''}</li>`);
  if (record.hasSbom) builtItems.push('<li>SBOM attached</li>');
  if (record.guardrails) {
    const link = record.guardrailsPrUrl
      ? ` — <a href="${esc(record.guardrailsPrUrl)}">gitops PR${record.guardrailsPrNumber ? ` #${record.guardrailsPrNumber}` : ''}</a>`
      : '';
    builtItems.push(`<li>${record.guardrails.passedChecks}/${record.guardrails.totalChecks} release guardrails passed${link}</li>`);
  }

  const happenedItems: string[] = record.promotionChain.map(
    p => `<li>${esc(p.fromEnv)} → ${esc(p.toEnv)} · ${formatDateTime(p.at)}</li>`,
  );
  const liveDeployment = record.deployments.find(d => d.isLive);
  if (liveDeployment?.rolloutStrategy) happenedItems.push(`<li>Rollout strategy: ${esc(liveDeployment.rolloutStrategy)}</li>`);
  if (liveDeployment?.rolloutStrategy === 'canary' && liveDeployment.canarySteps && liveDeployment.canarySteps.length > 0) {
    happenedItems.push(`<li>Canary steps: ${liveDeployment.canarySteps.length}</li>`);
  }
  if (!happenedItems.length) happenedItems.push('<li>No recorded promotions between tracked environments.</li>');

  const changeCounts = Object.entries(record.changeCategories)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} · ${count}`)
    .join(' &nbsp;·&nbsp; ');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Release Record · ${esc(record.appName)} ${esc(record.version ?? record.imageTag)}${record.nickname ? ` (${esc(record.nickname)})` : ''}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
<style>
  :root{
    --bg:#F1F3F5; --panel:#FFFFFF; --line:#D9DEE3;
    --text-hi:#14181C; --text-lo:#5B6570; --text-faint:#8B949C;
    --amber:#A96A16; --sky:#2A6E94; --good:#227048; --bad:#A03427;
  }
  *{box-sizing:border-box;}
  body{margin:0; background:var(--bg); color:var(--text-hi); font-family:"IBM Plex Sans","Segoe UI",sans-serif; padding:32px;}
  .mono{font-family:"IBM Plex Mono","SFMono-Regular",Consolas,monospace;}
  .page{
    background:var(--panel); max-width:760px; margin:0 auto; border-radius:3px;
    box-shadow:0 18px 46px -24px rgba(20,24,28,.35); padding:44px 48px 36px;
  }
  .head{display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--amber); padding-bottom:16px; margin-bottom:22px;}
  .mark{display:flex; align-items:center; gap:10px;}
  .ring{width:34px; height:34px; border-radius:50%; border:2px solid var(--amber); display:flex; align-items:center; justify-content:center;}
  .word{font-family:"IBM Plex Sans Condensed",sans-serif; font-weight:700; font-size:15px;}
  .word span{color:var(--amber);}
  .meta{text-align:right; font-size:10.5px; color:var(--text-faint); font-family:"IBM Plex Mono",monospace; line-height:1.6;}
  h1{font-family:"IBM Plex Sans Condensed",sans-serif; font-size:25px; font-weight:700; margin:0;}
  .sub{font-size:13px; color:var(--text-lo); margin-top:4px;}
  .cols{display:grid; grid-template-columns:1fr 1.3fr 1fr; align-items:start; gap:22px; margin-top:22px; font-size:11.5px;}
  .cols h5{
    font-family:"IBM Plex Sans Condensed",sans-serif; font-size:11px; letter-spacing:.07em; text-transform:uppercase;
    color:var(--amber); border-bottom:1px solid var(--line); padding-bottom:5px; margin-bottom:8px;
  }
  .cols ul{margin:0; padding-left:16px;}
  .cols li{color:var(--text-lo); margin-bottom:4px; line-height:1.5;}
  .cats{margin-top:8px; font-size:11px; color:var(--text-faint);}
  .human{margin-top:22px; border:1px dashed #C9A45E; background:#F7EFDD; border-radius:6px; padding:14px 16px; font-size:12px; color:#7A5115;}
  .foot{margin-top:26px; border-top:1px solid var(--line); padding-top:12px; display:flex; justify-content:space-between; font-size:10px; color:var(--text-faint); font-family:"IBM Plex Mono",monospace;}
  @media print {
    body{background:#fff; padding:0;}
    .page{box-shadow:none; max-width:none; border-radius:0;}
  }
</style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div class="mark">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="38" height="38" role="img" aria-label="Hangar mark"><rect x="8" y="8" width="80" height="80" rx="22" fill="#0B0D10"/><g transform="translate(48 48) scale(0.82) translate(-48 -48)"><circle cx="48" cy="48" r="40" fill="none" stroke="#262C33" stroke-width="2"/><g stroke="#66717B" stroke-width="2"><line x1="48" y1="8" x2="48" y2="15" transform="rotate(0 48 48)"/><line x1="48" y1="8" x2="48" y2="15" transform="rotate(45 48 48)"/><line x1="48" y1="8" x2="48" y2="15" transform="rotate(90 48 48)"/><line x1="48" y1="8" x2="48" y2="15" transform="rotate(135 48 48)"/><line x1="48" y1="8" x2="48" y2="15" transform="rotate(180 48 48)"/><line x1="48" y1="8" x2="48" y2="15" transform="rotate(225 48 48)"/><line x1="48" y1="8" x2="48" y2="15" transform="rotate(270 48 48)"/><line x1="48" y1="8" x2="48" y2="15" transform="rotate(315 48 48)"/></g><polygon points="44,2 52,2 48,9" fill="#E8A33D"/><path d="M32,64 V48 A16,16 0 0 1 64,48 V64" fill="none" stroke="#E8A33D" stroke-width="4" stroke-linecap="round"/><line x1="26" y1="68" x2="70" y2="68" stroke="#262C33" stroke-width="2"/></g></svg>
        <div class="word">HANGAR <span>· TOWER</span></div>
      </div>
      <div class="meta">RELEASE RECORD<br/>${esc(record.appName)} · ${esc(record.version ?? record.imageTag)}${nicknameBadgeHtml(record.nickname)}<br/>Generated ${formatDateTime(new Date().toISOString())}</div>
    </div>
    <h1>${esc(record.appName)} ${esc(record.version ?? record.imageTag)}${nicknameBadgeHtml(record.nickname)}</h1>
    <div class="sub">Deployed ${formatDateTime(record.createdAt)} · Confidence ${displayConfidence}/100 · ${record.status}</div>
    <div class="cols">
      <div>
        <h5>What changed</h5>
        <ul>${changedItems}</ul>
        ${changeCounts ? `<div class="cats">${changeCounts}</div>` : ''}
      </div>
      <div>
        <h5>What was built</h5>
        <ul>${builtItems.join('')}</ul>
      </div>
      <div>
        <h5>What happened</h5>
        <ul>${happenedItems.join('')}</ul>
      </div>
    </div>
    <div class="human">${humanContextHtml(humanContext)}</div>
    <div class="cats" style="margin-top:18px;">
      <b>How the confidence score (${displayConfidence}/100) is calculated</b> - a heuristic from evidence Tower can see, not a prediction:
      ${confidenceBreakdown(record, humanContext?.approvals.length ?? 0)
        .map(l => `${esc(l.label)} +${l.points}/${l.max} (${esc(l.note)})`)
        .join(' · ')}
    </div>
    <div class="foot">
      <span class="mono">tower/release-record@1 · ${esc(record.id)}</span>
      <span>Generated ${esc(new Date().toISOString())}</span>
    </div>
  </div>
</body>
</html>`;
}

function fileNameFor(record: ReleaseRecord): string {
  const safeApp = record.appName.replace(/[^a-z0-9-]/gi, '-');
  const safeVer = (record.version ?? record.imageTag).replace(/[^a-z0-9-]/gi, '-');
  return `release-record-${safeApp}-${safeVer}.html`;
}

// Standard blob+temporary-anchor download - a real web app (this isn't a
// sandboxed artifact preview), so this works the ordinary way.
export function downloadReleaseRecordHtml(record: ReleaseRecord, humanContext?: ReleaseRecordHumanContext): void {
  const html = buildReleaseRecordHtml(record, humanContext);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(record);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// v1 PDF path: print the same self-contained export document in its own
// window rather than fighting the live app's own dark-theme chrome with a
// print stylesheet - a printed release record should look like the "paper"
// artboard regardless of Tower's own theme, and this guarantees exactly
// that with no risk of sidebar/nav chrome leaking into the printout. The
// browser's own print dialog offers "Save as PDF" - no server-side
// rendering needed for this v1 (see the handoff's own "v2 PDF" note for
// what a real one-click download would need instead).
export function printReleaseRecordPdf(record: ReleaseRecord, humanContext?: ReleaseRecordHumanContext): void {
  const html = buildReleaseRecordHtml(record, humanContext);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the popup a tick to lay out its just-written document (and start
  // loading the Google Fonts stylesheet) before the print dialog snapshots
  // it - calling print() synchronously on a freshly-written document can
  // race the browser's own layout pass.
  setTimeout(() => win.print(), 300);
}
