// 빈 구간 보고서 (data-spec 2.6). 정제 단계(F-02)의 필터 근거로 쓴다.
// 실행 시각을 넣지 않아서 원본이 같으면 보고서도 같다.

import { type Candle, HOUR_MS } from './candles';

/** 보고서에 남기는 가장 긴 빈 구간 수 */
export const LONGEST_GAPS = 10;

export interface GapInterval {
  /** 비어 있는 첫 시각 */
  from: string;
  hours: number;
}

export interface MarketGapSummary {
  market: string;
  first: string;
  last: string;
  /** first~last 사이 시간 수 (양 끝 포함) */
  expectedHours: number;
  presentHours: number;
  missingHours: number;
  /** missingHours ÷ expectedHours, 소수 4자리 */
  missingRatio: number;
  gapCount: number;
  longestGapHours: number;
  longestGaps: GapInterval[];
}

export interface MarketGapEntry extends MarketGapSummary {
  /** 지금 원화 마켓 목록에 있는지 (없으면 상장 폐지 등) */
  inMarketList: boolean;
  /** 모든 마켓 중 가장 최근 캔들 시각 − 이 마켓의 마지막 캔들 시각 (시간). 거래 정지 등을 찾는다 */
  staleHours: number;
}

export interface MarketGapError {
  market: string;
  error: string;
}

export interface GapsReport {
  summary: { markets: number; candles: number; missingHours: number; errors: number };
  markets: (MarketGapEntry | MarketGapError)[];
}

const toIso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

/** 캔들(time 오름차순)의 빈 구간을 요약한다. 캔들이 없으면 undefined */
export function summarizeGaps(market: string, candles: Candle[]): MarketGapSummary | undefined {
  const first = candles[0];
  const last = candles.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const gaps: GapInterval[] = [];
  let previous = Date.parse(first.time);
  for (const candle of candles.slice(1)) {
    const current = Date.parse(candle.time);
    const missing = (current - previous) / HOUR_MS - 1;
    if (missing > 0) {
      gaps.push({ from: toIso(previous + HOUR_MS), hours: missing });
    }
    previous = current;
  }
  const expectedHours = (Date.parse(last.time) - Date.parse(first.time)) / HOUR_MS + 1;
  const missingHours = expectedHours - candles.length;
  const longestGaps = [...gaps]
    .sort((a, b) => b.hours - a.hours || (a.from < b.from ? -1 : 1))
    .slice(0, LONGEST_GAPS);
  return {
    market,
    first: first.time,
    last: last.time,
    expectedHours,
    presentHours: candles.length,
    missingHours,
    missingRatio: Math.round((missingHours / expectedHours) * 10_000) / 10_000,
    gapCount: gaps.length,
    longestGapHours: longestGaps[0]?.hours ?? 0,
    longestGaps,
  };
}

/** 마켓별 요약을 모아 보고서를 만든다. 마켓 코드 오름차순 */
export function buildGapsReport(
  results: (MarketGapSummary | MarketGapError)[],
  listedMarkets: ReadonlySet<string>,
): GapsReport {
  const summaries = results.filter((r): r is MarketGapSummary => !('error' in r));
  const latest = Math.max(...summaries.map((s) => Date.parse(s.last)));
  const markets = results
    .map((r): MarketGapEntry | MarketGapError =>
      'error' in r
        ? r
        : {
            ...r,
            inMarketList: listedMarkets.has(r.market),
            staleHours: (latest - Date.parse(r.last)) / HOUR_MS,
          },
    )
    .sort((a, b) => (a.market < b.market ? -1 : a.market > b.market ? 1 : 0));
  return {
    summary: {
      markets: summaries.length,
      candles: summaries.reduce((sum, s) => sum + s.presentHours, 0),
      missingHours: summaries.reduce((sum, s) => sum + s.missingHours, 0),
      errors: results.length - summaries.length,
    },
    markets,
  };
}
