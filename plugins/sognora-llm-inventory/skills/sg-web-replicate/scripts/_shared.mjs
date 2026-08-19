/**
 * capture.mjs와 diff.mjs가 공유하는 계산 — 두 스크립트가 다른 값을 쓰면 "동일 조건"이 깨진다.
 *
 * - 스크롤 지점: 예전 고정 0/50/100은 3×뷰포트보다 긴 페이지에서 밴드 사각지대를 만들었다
 *   (실측: 5400px 페이지에서 사각지대 섹션 2개를 통째로 바꿔도 pixel 0.82%로 PASS).
 *   페이지 높이에 비례해 창이 연속 타일이 되도록 지점을 늘린다.
 * - 커버리지: 창들이 실제로 덮는 비율. 상한에 걸려 100% 미만이면 보고서에 그대로 드러난다.
 * - 콘솔 오류 정규화: 원본이 스스로 뿜는 오류(aside.com 실측 2~4건)를 baseline으로 빼고
 *   "원본에 없던 새 오류"만 결함으로 세기 위한 공통 키.
 */

export const MAX_SCROLL_POINTS = 12;

/**
 * 가상 시계 — 타이머 구동 비결정(타이핑·캐러셀·위젯 부트)을 결정화한다.
 * 실측 근거: ① 로드 "전" 동결이어야 한다(로드 후 동결은 로드 소요 시간만큼 실시간이 새서
 * 결정성이 깨진다) ② IO 리빌·native lazy·networkidle은 타이머가 아니라 렌더/네트워크
 * 이벤트라 동결 상태에서도 정상 작동한다 ③ 동결+runFor 레시피로 3회 연속 비트 동일 확인.
 * capture가 이 값을 meta.json에 기록하고 diff는 **기록된 값 그대로** 재현한다 — 값이
 * 다르면 동일 조건이 아니므로 비교 자체를 거부해야 한다.
 */
export const CLOCK_DEFAULTS = { epoch: "2026-01-01T00:00:00.000Z", runFor: 3000 };

/** goto 이전에 호출: 고정 시각으로 설치+동결. (컨텍스트마다 새로 설치해야 한다) */
export async function installFrozenClock(page, epoch) {
  await page.clock.install({ time: new Date(epoch) });
  await page.clock.pauseAt(new Date(epoch));
}

/** 페이지를 뷰포트 창의 연속 타일로 덮는 정수 % 지점 목록. */
export function autoScrollPoints(pageHeight, viewportHeight) {
  const S = pageHeight - viewportHeight; // 스크롤 가능 거리
  if (S <= 0) return [0];
  // 연속 커버 조건: 이웃 지점 간 % 차 k에 대해 S·k/100 ≤ VH  →  k ≤ 100·VH/S
  const k = Math.max(1, Math.floor((100 * viewportHeight) / S));
  const pts = [];
  for (let p = 0; p < 100; p += k) pts.push(p);
  pts.push(100);
  if (pts.length <= MAX_SCROLL_POINTS) return pts;
  // 상한 초과 — 균등 재배분. 커버리지 미달은 coveragePct가 수치로 드러낸다.
  const out = new Set();
  for (let i = 0; i < MAX_SCROLL_POINTS; i++) out.add(Math.round((i * 100) / (MAX_SCROLL_POINTS - 1)));
  return [...out];
}

/** 지점 목록이 페이지에서 실제로 덮는 비율(%). 위치는 px로 환산해 구간 합집합으로 계산한다. */
export function coveragePct(points, pageHeight, viewportHeight) {
  if (!pageHeight || pageHeight <= viewportHeight) return 100;
  const S = pageHeight - viewportHeight;
  const iv = [...points]
    .sort((a, b) => a - b)
    .map((p) => {
      const pos = (S * p) / 100;
      return [pos, Math.min(pageHeight, pos + viewportHeight)];
    });
  let covered = 0;
  let end = -1;
  for (const [a, b] of iv) {
    const s = Math.max(a, end);
    if (b > s) covered += b - s;
    end = Math.max(end, b);
  }
  return +((covered / pageHeight) * 100).toFixed(1);
}

/** 콘솔 오류를 baseline 대조용 키로 정규화 — URL·숫자는 origin·타이밍에 따라 달라진다. */
export function normalizeConsoleError(text) {
  return String(text ?? "")
    .replace(/https?:\/\/[^\s")]+/g, "<url>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
