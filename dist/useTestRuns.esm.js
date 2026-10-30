import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function useTestRuns(appName, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(appName), runs: [] });
  useEffect(() => {
    if (!appName) {
      setState({ loading: false, runs: [] });
      return void 0;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: void 0 }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${baseUrl}/tests?app=${encodeURIComponent(appName)}&limit=100`);
        if (!res.ok) {
          const body2 = await res.json().catch(() => void 0);
          throw new Error(body2?.error ?? `${res.status} ${res.statusText}`);
        }
        const body = await res.json();
        if (!cancelled) setState({ loading: false, runs: body.runs ?? [] });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e), runs: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, refreshNonce, discoveryApi, fetchApi]);
  return state;
}
async function fetchTestReport(fetchApi, baseUrl, appName, run) {
  const res = await fetchApi.fetch(
    `${baseUrl}/tests/report?id=${encodeURIComponent(run.id)}${appName ? `&app=${encodeURIComponent(appName)}` : ""}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => void 0);
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.text();
}
async function downloadTestReport(fetchApi, baseUrl, appName, run) {
  const xml = await fetchTestReport(fetchApi, baseUrl, appName, run);
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${run.workflow}-${run.id}-junit.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
const NOT_OURS = /node:internal|node_modules|site-packages|\/usr\/lib\//;
function parseJUnitFailures(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return void 0;
  const root = doc.documentElement?.nodeName;
  if (root !== "testsuites" && root !== "testsuite") return void 0;
  const cases = Array.from(doc.getElementsByTagName("testcase"));
  const failures = [];
  for (const c of cases) {
    const f = Array.from(c.children).find((e) => e.nodeName === "failure" || e.nodeName === "error");
    if (!f) continue;
    const detail = (f.textContent ?? "").trim();
    const lines = detail.split("\n").map((l) => l.trim()).filter(Boolean);
    failures.push({
      name: c.getAttribute("name") ?? "?",
      classname: c.getAttribute("classname") || void 0,
      message: f.getAttribute("message") || lines[0] || f.nodeName,
      location: lines.find((l) => /[^ ():]+:\d+/.test(l) && !NOT_OURS.test(l)),
      detail
    });
  }
  return { total: cases.length, failures };
}

export { downloadTestReport, fetchTestReport, parseJUnitFailures, useTestRuns };
//# sourceMappingURL=useTestRuns.esm.js.map
