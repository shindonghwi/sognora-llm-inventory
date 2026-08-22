import { readFile, writeFile } from "node:fs/promises";

/**
 * PNG 한 상태를 fail-closed로 비교한다.
 * 크기가 다르거나 디코드/기록이 실패하면 작은 쪽으로 자르지 않고 그 상태 자체를 실패로 반환한다.
 */
export async function comparePng({ PNG, pixelmatch, refPath, localPath, outPath, masks = [], shotTop = 0 }) {
  let a;
  let b;
  try {
    a = PNG.sync.read(await readFile(refPath));
    b = PNG.sync.read(await readFile(localPath));
  } catch (error) {
    return { ok: false, error: `PNG 디코드 실패: ${error.message}`, mismatchPct: null };
  }

  const sizeDelta = [a.width - b.width, a.height - b.height];
  if (a.width !== b.width || a.height !== b.height) {
    return {
      ok: false,
      error: `이미지 크기 불일치: ref ${a.width}x${a.height}, local ${b.width}x${b.height}`,
      mismatchPct: 100,
      maskedPct: 0,
      sizeDelta,
    };
  }

  const width = a.width;
  const height = a.height;
  const diff = new PNG({ width, height });
  const maskedPixels = new Uint8Array(width * height);
  let masked = 0;
  for (const mask of masks) {
    const my = mask.space === "viewport" ? mask.y : mask.y - shotTop;
    const x0 = Math.max(0, Math.round(mask.x));
    const y0 = Math.max(0, Math.round(my));
    const x1 = Math.min(width, Math.round(mask.x + mask.w));
    const y1 = Math.min(height, Math.round(my + mask.h));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = width * y + x;
        if (!maskedPixels[p]) { maskedPixels[p] = 1; masked++; }
        const i = p << 2;
        a.data[i] = b.data[i] = 0;
        a.data[i + 1] = b.data[i + 1] = 0;
        a.data[i + 2] = b.data[i + 2] = 0;
        a.data[i + 3] = b.data[i + 3] = 255;
      }
    }
  }

  let mismatch;
  try {
    mismatch = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
    await writeFile(outPath, PNG.sync.write(diff));
  } catch (error) {
    return { ok: false, error: `pixel diff 실행 실패: ${error.message}`, mismatchPct: null, sizeDelta };
  }
  const judged = Math.max(1, width * height - masked);
  return {
    ok: true,
    mismatchPct: (mismatch / judged) * 100,
    maskedPct: Number(((masked / (width * height)) * 100).toFixed(4)),
    sizeDelta,
  };
}

/** 테스트에서 실제 PNG 의존성 없이 크기 fail-closed 불변식을 검증한다. */
export function dimensionsMatch(a, b) {
  return Boolean(a && b && a.width === b.width && a.height === b.height);
}
