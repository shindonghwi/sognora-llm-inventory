import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compare, skeleton, jaccard } from "../scripts/sameness.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const load = async (n) => JSON.parse(await readFile(join(here, "fixtures", n), "utf8"));

test("같은 페이지 둘은 100% 일치, 다른 유형끼리는 CROSS-TYPE-CLONE", async () => {
  const a = await load("slop-landing.scan.json"), b = await load("clean-document.scan.json");
  const vpA = Object.values(a.viewports)[0], vpB = Object.values(b.viewports)[0];
  assert.equal(jaccard(skeleton(vpA), skeleton(vpA)), 1);
  const res = compare([a, a], ["landing", "catalog"]);
  assert.ok(res.findings.some((f) => f.id === "sameness.cross-type-clone"), JSON.stringify(res.findings.map((f) => f.id)));
  const ok = compare([a, b], ["landing", "document"]);
  assert.ok(!ok.findings.some((f) => f.id === "sameness.cross-type-clone"));
});
