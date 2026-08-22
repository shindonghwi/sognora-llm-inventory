#!/usr/bin/env node
/** routes.json의 전 라우트를 결정적 routeId 디렉터리에 캡처하고 누락 없이 집계한다. */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";
import { join } from "node:path";
import { loadStateContract, routeId, verifyEvidence } from "./_shared.mjs";
import { validatePopupProbe } from "./_popup.mjs";

const args = parseArgs(argv.slice(2));
if (!args.routes || !args.out || !args.states) {
  console.error("usage: capture-site.mjs --routes routes.json --out ref-root --states states.json [--viewports WxH,...]");
  exit(2);
}
const ledger = JSON.parse(await readFile(args.routes,"utf8"));
if (!Array.isArray(ledger.routes) || !ledger.origin || ledger.limitReached || (ledger.skipped??[]).length) {
  console.error("완전한 routes.json v2 원장이 필요합니다(limitReached/skipped 불가)"); exit(2);
}
const viewportLabels=parseViewports(args.viewports??"1440x900,768x1024,390x844");
let stateContract;
try{stateContract=await loadStateContract(args.states);}catch(error){console.error(`상태 계약 오류: ${error.message}`);exit(2);}
const popupProbeErrors=validatePopupProbe(stateContract,ledger.routes.map((entry)=>entry.route??entry.path),viewportLabels);
if(popupProbeErrors.length){console.error(popupProbeErrors.join("\n"));exit(2);}
await mkdir(args.out,{recursive:true});
const captureScript=fileURLToPath(new URL("./capture.mjs",import.meta.url));
const results=[];
for(const entry of ledger.routes){
  const route=entry.route??entry.path;const id=routeId(route);const out=join(args.out,id);
  const child=[captureScript,"--url",new URL(route,ledger.origin).href,"--route",route,"--out",out,"--states",args.states];
  for(const key of ["viewports","dpr","storage","scroll-y","clock"]){if(args[key])child.push(`--${key}`,String(args[key]));}
  for(const flag of ["headed","force","no-clock"]){if(args[flag])child.push(`--${flag}`);}
  const code=await run(process.execPath,child);const evidence=[];
  if(code===0){
    for(const vp of viewportLabels){
      try{const checked=await verifyEvidence(join(out,vp));if(!checked.ok)evidence.push(...checked.errors.map((error)=>({viewport:vp,error})));}
      catch(error){evidence.push({viewport:vp,error:error.message});}
    }
  }
  results.push({route,routeId:id,exitCode:code,evidence});
}
const failures=results.filter((r)=>r.exitCode!==0||r.evidence.length);
await writeFile(join(args.out,"capture-completion.json"),JSON.stringify({version:3,pass:failures.length===0,routesExpected:ledger.routes.length,routesCaptured:results.length,results},null,2));
console.log(failures.length?`FAIL 캡처 ${failures.length}/${results.length}`:`PASS 전 라우트 ${results.length}개 기준 증거 완성`);
exit(failures.length?1:0);
function run(command,childArgs){return new Promise((resolve,reject)=>{const child=spawn(command,childArgs,{stdio:"inherit"});child.on("error",reject);child.on("exit",resolve);});}
function parseViewports(value){return String(value).split(",").map((v)=>v.trim());}
function parseArgs(values){const out={};for(let i=0;i<values.length;i++){if(!values[i].startsWith("--"))continue;const key=values[i].slice(2);out[key]=values[i+1]&&!values[i+1].startsWith("--")?values[++i]:true;}return out;}
