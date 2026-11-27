// 마켓 하나 수집: 새 캔들 → 과거 이어 받기 → 합치기 → 저장 (data-spec 2.5)

import { type Candle, type FetchBackwardDeps, fetchBackward, mergeCandles } from './candles';
import {
  candlePath,
  formatCandleCsv,
  type MarketState,
  readCandleCsv,
  writeFileAtomic,
} from './storage';

export interface MarketResult {
  market: string;
  /** 최신 쪽에서 새로 받은 캔들 수 */
  addedNew: number;
  /** 과거 쪽에서 이어 받은 캔들 수 */
  addedOld: number;
  /** 저장 후 전체 캔들 수 */
  total: number;
  reachedStart: boolean;
  /** 같은 time인데 값이 다른 캔들 수 (기존 값 유지) */
  conflicts: number;
  pages: number;
}

/**
 * 받은 범위는 CSV 첫·끝 행이 기준이다 (D-59). 다 받은 뒤 한 번에 저장한다.
 * 기존 CSV가 깨져 있으면 예외를 던지고 파일을 건드리지 않는다.
 */
export async function collectMarket(
  market: string,
  previous: MarketState | undefined,
  rawDir: string,
  deps: FetchBackwardDeps,
): Promise<{ result: MarketResult; state: MarketState }> {
  const path = candlePath(rawDir, market);
  const existing = (await readCandleCsv(path)) ?? [];
  const first = existing[0];
  const last = existing.at(-1);

  let reachedStart = previous?.reachedStart ?? false;
  let newer: Candle[];
  let older: Candle[] = [];
  let pages = 0;

  if (first === undefined || last === undefined) {
    // 처음 받는 마켓: 최신부터 상장 첫 캔들까지
    const all = await fetchBackward(market, {}, deps);
    newer = all.candles;
    reachedStart = all.reachedStart;
    pages += all.pages;
  } else {
    const fresh = await fetchBackward(market, { stopAtOrBefore: last.time }, deps);
    newer = fresh.candles;
    pages += fresh.pages;
    if (!reachedStart) {
      const past = await fetchBackward(market, { to: first.time }, deps);
      older = past.candles;
      reachedStart = past.reachedStart;
      pages += past.pages;
    }
  }

  const merged = mergeCandles(existing, [...older, ...newer]);
  if (merged.added > 0) {
    await writeFileAtomic(path, formatCandleCsv(merged.candles));
  }

  const addedOld = first === undefined ? 0 : older.filter((c) => c.time < first.time).length;
  return {
    result: {
      market,
      addedNew: merged.added - addedOld,
      addedOld,
      total: merged.candles.length,
      reachedStart,
      conflicts: merged.conflicts,
      pages,
    },
    state: { reachedStart },
  };
}
