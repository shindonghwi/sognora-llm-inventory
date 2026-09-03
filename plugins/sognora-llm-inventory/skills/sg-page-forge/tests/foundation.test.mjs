import { test } from "node:test";
import assert from "node:assert/strict";
import { assessFromInputs } from "../scripts/foundation.mjs";

const full = { pkg: { dependencies: { next: "16.0.0", "@tanstack/react-query": "5.0.0", zod: "4.0.0", "react-hook-form": "7.0.0", motion: "12.0.0", "@radix-ui/react-dialog": "1.0.0" }, devDependencies: { typescript: "5", tailwindcss: "4.1.0" } },
  files: { tsconfig: true, componentsJson: true, uiDirFiles: 8, globalsCss: ":root{--background: 40 20% 98%;} body{font-family: Pretendard, sans-serif}" } };

test("기본 스택이 전부 있으면 ready", () => {
  const r = assessFromInputs(full);
  assert.equal(r.ready, true, JSON.stringify(r.layers.filter((l) => l.status !== "✅")));
  assert.deepEqual(r.missing, []);
});

test("빈 프로젝트는 빠진 층을 처방과 함께 낸다(토큰 층은 편집 처방)", () => {
  const r = assessFromInputs({ pkg: { dependencies: { react: "19" } }, files: { tsconfig: false, componentsJson: false, uiDirFiles: 0, globalsCss: null } });
  assert.equal(r.ready, false);
  for (const id of ["framework", "typescript", "tailwind", "components", "query", "forms", "motion"]) assert.ok(r.missing.includes(id), id);
  assert.ok(r.layers.every((l) => l.status === "✅" || l.fix), "처방 없는 결손 없음");
});

test("사장님 실측 형태: Tailwind 3 + framer-motion + shadcn 기본 테마 + Inter", () => {
  const r = assessFromInputs({ pkg: { dependencies: { next: "16", "@radix-ui/react-dialog": "1", "framer-motion": "12", "@tanstack/react-query": "5", zustand: "5" }, devDependencies: { tailwindcss: "^3.4.18", typescript: "5" } },
    files: { tsconfig: true, componentsJson: true, uiDirFiles: 10, globalsCss: ":root{--background: 0 0% 100%;--foreground: 0 0% 13%;--muted: 0 0% 96%;--border: 0 0% 88%;} body{font-family: Inter, sans-serif}" } });
  assert.ok(r.soft.includes("tailwind"), "Tailwind 3은 점진 이행 권장(🟡)");
  assert.ok(r.soft.includes("motion"), "framer-motion은 점진 이행 권장(🟡)");
  assert.ok(r.missing.includes("tokens"), "shadcn 기본 테마 + Inter 단독은 토큰 층 결손");
  assert.ok(r.missing.includes("forms"), "zod·RHF 없음");
});

test("기존 프레임워크(Astro)는 존중한다 — Next 강제 없음", () => {
  const r = assessFromInputs({ pkg: { dependencies: { astro: "5" }, devDependencies: { tailwindcss: "4", typescript: "5" } }, files: { tsconfig: true, componentsJson: false, uiDirFiles: 3, globalsCss: "body{font-family: Pretendard}" } });
  const fw = r.layers.find((l) => l.id === "framework");
  assert.equal(fw.status, "🟡"); assert.ok(!r.missing.includes("framework"));
});
