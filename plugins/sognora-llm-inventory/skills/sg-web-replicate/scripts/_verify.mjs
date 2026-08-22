/** 전 사이트 완료 판정의 순수 로직. verify-site.mjs와 악성 회귀 테스트가 같이 쓴다. */
export function validateSiteCompletion({ ledger, routeReports, notFoundLocal }) {
  const failures = [];
  const rows = [];
  if (!ledger || !Array.isArray(ledger.routes)) failures.push({ kind: "ledger-invalid" });
  if (ledger?.limitReached) failures.push({ kind: "route-limit-reached" });
  if ((ledger?.skipped ?? []).length) failures.push({ kind: "route-skipped", count: ledger.skipped.length });
  if (!ledger?.notFoundProbe) failures.push({ kind: "not-found-reference-missing" });

  for (const entry of ledger?.routes ?? []) {
    const route = entry.route ?? entry.path;
    const report = routeReports.get(route);
    if (!report) {
      failures.push({ kind: "route-report-missing", route });
      rows.push({ route, pass: false, reason: "report missing" });
      continue;
    }
    const reasons = [];
    if (!report.strict) reasons.push("not-strict");
    if (report.diagnosticOnly) reasons.push("diagnostic-only");
    if (!report.pixelJudged) reasons.push("pixel-unjudged");
    if (!report.pass) reasons.push("route-failed");
    if (!report.report?.length) reasons.push("viewport-missing");
    const refStatus = report.report?.[0]?.route?.ref?.status;
    if (entry.status !== refStatus) reasons.push(`ledger-status:${entry.status}!=${refStatus}`);
    for (const vp of report.report ?? []) {
      if (!vp.pass) reasons.push(`viewport-failed:${vp.viewport}`);
      if (vp.expectedStateCount !== vp.comparedStateCount) reasons.push(`state-coverage:${vp.viewport}`);
      if (vp.pixelCoveragePct?.ref !== 100 || vp.pixelCoveragePct?.local !== 100) reasons.push(`pixel-coverage:${vp.viewport}`);
      if (!vp.route?.local?.renderer || !vp.route?.local?.renderSignature) reasons.push(`renderer-evidence:${vp.viewport}`);
      if (vp.structureDelta !== 0) reasons.push(`structure-delta:${vp.viewport}`);
      if ((vp.missingStates ?? []).length || (vp.failedPixels ?? []).length) reasons.push(`state-failure:${vp.viewport}`);
      if ((vp.route?.offenders ?? []).length) reasons.push(`route-metadata:${vp.viewport}`);
      if ((vp.executionErrors ?? []).length) reasons.push(`execution-error:${vp.viewport}`);
    }
    if (reasons.length) failures.push({ kind: "route-incomplete", route, reasons });
    rows.push({ route, pass: reasons.length === 0, viewports: report.report?.length ?? 0,
      states: (report.report ?? []).reduce((n, vp) => n + (vp.comparedStateCount ?? 0), 0), reasons });
  }

  // 서로 다른 원본 화면이 로컬에서 정확히 같은 렌더 signature가 되면 catch-all/fallback으로 본다.
  const signatures = new Map();
  for (const entry of ledger?.routes ?? []) {
    const route = entry.route ?? entry.path;
    const report = routeReports.get(route);
    const vp = report?.report?.[0];
    const localSig = vp?.route?.local?.renderSignature;
    const refSig = vp?.route?.ref?.renderSignature;
    if (!localSig) continue;
    if (!signatures.has(localSig)) signatures.set(localSig, []);
    signatures.get(localSig).push({ route, refSig });
  }
  for (const group of signatures.values()) {
    if (group.length < 2) continue;
    if (new Set(group.map((x) => x.refSig)).size > 1) {
      failures.push({ kind: "unexpected-fallback", routes: group.map((x) => x.route) });
    }
  }

  if (ledger?.notFoundProbe) {
    if (!notFoundLocal) failures.push({ kind: "not-found-local-missing" });
    else {
      for (const key of ["status", "finalRoute", "canonical"]) {
        if (ledger.notFoundProbe[key] !== notFoundLocal[key]) {
          failures.push({ kind: `not-found-${key}`, ref: ledger.notFoundProbe[key], local: notFoundLocal[key] });
        }
      }
    }
  }
  return { pass: failures.length === 0, rows, failures };
}
