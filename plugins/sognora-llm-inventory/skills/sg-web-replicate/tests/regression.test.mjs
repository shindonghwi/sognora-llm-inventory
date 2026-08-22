import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { autoScrollPositions, captureClock, coveragePct, scriptFingerprint, verifyEvidence, writeEvidence } from "../scripts/_shared.mjs";
import { comparePng, dimensionsMatch } from "../scripts/_pixel.mjs";
import { validateSiteCompletion } from "../scripts/_verify.mjs";
import { buildEntryScenarios, validatePopupProbe } from "../scripts/_popup.mjs";

test("기준 캡처 기본 시각은 하드코딩 날짜가 아니라 실제 관찰 시작 시각이다", () => {
  const observed = new Date("2034-07-09T12:34:56.000Z");
  const clock = captureClock(undefined, observed);
  assert.equal(clock.epoch, observed.toISOString());
  assert.equal(clock.source, "observed-at-capture");
});

test("첫 진입 팝업은 닫기·체크·재방문 억제 상태 계약으로 확장된다", () => {
  const result = buildEntryScenarios([{
    route: "/", viewport: "390x844", discoveredAtMs: 500,
    surfaces: [{
      selector: "[role=dialog]", motionMs: 200, discoveredAtMs: 500,
      controls: [
        { selector: "#popup-close", action: "close", checkable: false },
        { selector: "#hide-today", action: "suppress", checkable: true },
      ],
    }],
  }]);
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.scenarios.length, 3);
  assert.ok(result.scenarios.some((scenario) => scenario.trigger.type === "reload"));
  assert.ok(result.scenarios.some((scenario) => scenario.frames.some((frame) => frame.name === "mid")));
  assert.ok(result.scenarios.flatMap((scenario) => scenario.assertions).some((item) => item.state === "hidden"));
});

test("닫기 제어가 없는 진입 레이어는 조용히 완료되지 않는다", () => {
  const result = buildEntryScenarios([{
    route: "/", viewport: "1440x900",
    surfaces: [{ selector: ".unknown-overlay", controls: [] }],
  }]);
  assert.equal(result.scenarios.length, 0);
  assert.equal(result.unresolved.length, 1);
});

test("최종 route×viewport의 popup probe가 하나라도 빠지면 캡처를 거부한다", () => {
  const routes = ["/", "/about"];
  const contract = { popupProbe: {
    routesSha256: "wrong",
    failed: [], unresolved: [],
    probed: [{ route: "/", viewport: "390x844" }],
  } };
  const errors = validatePopupProbe(contract, routes, ["390x844"]);
  assert.ok(errors.some((error) => /원장 해시/.test(error)));
  assert.ok(errors.some((error) => /\/about/.test(error)));
});

test("10만 px 페이지도 축약 없이 100%를 덮는다", () => {
  const positions = autoScrollPositions(100_000, 900);
  assert.ok(positions.length > 12);
  assert.equal(coveragePct(positions, 100_000, 900), 100);
  assert.equal(positions.at(-1), 99_100);
});

test("이미지 크기 불일치는 crop 통과가 아니다", () => {
  assert.equal(dimensionsMatch({ width: 100, height: 100 }, { width: 99, height: 100 }), false);
});

test("깨진 PNG 한 장도 개별 상태 실패다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sg-replica-png-"));
  try {
    const ref = join(dir, "ref.png"), local = join(dir, "local.png");
    await writeFile(ref, "broken"); await writeFile(local, "broken");
    const PNG = { sync: { read() { throw new Error("invalid png"); } } };
    const result = await comparePng({ PNG, pixelmatch() {}, refPath:ref, localPath:local, outPath:join(dir,"diff.png") });
    assert.equal(result.ok, false);
    assert.match(result.error, /디코드 실패/);
  } finally { await rm(dir, { recursive:true, force:true }); }
});

test("SHA-256 증거가 변조된 파일을 거부한다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sg-replica-evidence-"));
  try {
    await writeFile(join(dir,"full.png"),"original");
    await writeEvidence(dir,{viewport:"390x844"});
    assert.equal((await verifyEvidence(dir)).ok,true);
    await writeFile(join(dir,"full.png"),"tampered");
    assert.equal((await verifyEvidence(dir)).ok,false);
  } finally { await rm(dir, { recursive:true, force:true }); }
});

test("스크립트 지문에 _shared와 _deps가 포함된다", async () => {
  const scripts = fileURLToPath(new URL("../scripts", import.meta.url));
  const fingerprint = await scriptFingerprint(scripts);
  assert.ok(fingerprint.files.includes("_shared.mjs"));
  assert.ok(fingerprint.files.includes("_deps.mjs"));
  assert.equal(fingerprint.sha256.length,64);
});

test("라우트 하나가 빠지면 전 사이트 완료가 아니다", () => {
  const ledger = ledgerOf("/", "/about");
  const reports = new Map([["/", goodReport("/","sig-home","ref-home")]]);
  const result = validateSiteCompletion({ ledger, routeReports:reports, notFoundLocal:ledger.notFoundProbe });
  assert.equal(result.pass,false);
  assert.ok(result.failures.some((f)=>f.kind==="route-report-missing"&&f.route==="/about"));
});

test("빈 페이지·누락 상태·잘못된 redirect를 조작한 report도 거부한다", () => {
  const ledger = ledgerOf("/");
  const report = goodReport("/","local","ref");
  const vp = report.report[0];
  vp.structureDelta = 12;
  vp.expectedStateCount = 4; vp.comparedStateCount = 3; vp.missingStates=["menu:after"];
  vp.route.offenders=[{kind:"finalRoute",ref:"/",local:"/fallback"}];
  const result = validateSiteCompletion({ ledger, routeReports:new Map([["/",report]]), notFoundLocal:ledger.notFoundProbe });
  assert.equal(result.pass,false);
  assert.match(result.rows[0].reasons.join(" "),/structure-delta/);
  assert.match(result.rows[0].reasons.join(" "),/state-coverage/);
  assert.match(result.rows[0].reasons.join(" "),/route-metadata/);
});

test("서로 다른 원본 라우트가 같은 로컬 fallback으로 렌더되면 실패한다", () => {
  const ledger = ledgerOf("/a","/b");
  const reports = new Map([
    ["/a",goodReport("/a","same-local","ref-a")],
    ["/b",goodReport("/b","same-local","ref-b")],
  ]);
  const result = validateSiteCompletion({ ledger, routeReports:reports, notFoundLocal:ledger.notFoundProbe });
  assert.equal(result.pass,false);
  assert.ok(result.failures.some((f)=>f.kind==="unexpected-fallback"));
});

test("404 status가 원본과 다르면 실패한다", () => {
  const ledger = ledgerOf("/");
  const local404 = { ...ledger.notFoundProbe, status:200 };
  const result = validateSiteCompletion({ ledger, routeReports:new Map([["/",goodReport("/","local","ref")]]), notFoundLocal:local404 });
  assert.equal(result.pass,false);
  assert.ok(result.failures.some((f)=>f.kind==="not-found-status"));
});

function ledgerOf(...routes) {
  return { version:2, origin:"https://reference.test", limitReached:false, skipped:[],
    routes:routes.map((route)=>({route,status:200})),
    notFoundProbe:{route:"/.missing",status:404,finalRoute:"/.missing",canonical:null} };
}
function goodReport(route, localSignature, refSignature) {
  return { strict:true, diagnosticOnly:false, pixelJudged:true, pass:true,
    report:[{viewport:"390x844",pass:true,expectedStateCount:3,comparedStateCount:3,
      pixelCoveragePct:{ref:100,local:100},structureDelta:0,missingStates:[],failedPixels:[],executionErrors:[],
      route:{ref:{status:200,renderSignature:refSignature},local:{renderer:"next",renderSignature:localSignature},offenders:[]}}] };
}
