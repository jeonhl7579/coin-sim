import { describe, expect, it } from 'vitest';
import type { Candle } from './candles';
import { buildGapsReport, LONGEST_GAPS, summarizeGaps } from './gaps';
import { hour } from './testing';

const candlesAt = (indexes: number[]): Candle[] =>
  indexes.map((i) => ({
    time: hour(i),
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    quoteVolume: 1,
  }));
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('summarizeGaps', () => {
  it('캔들이 없으면 undefined', () => {
    expect(summarizeGaps('KRW-AAA', [])).toBeUndefined();
  });

  it('빈 시간이 없으면 0', () => {
    expect(summarizeGaps('KRW-AAA', candlesAt(range(0, 9)))).toEqual({
      market: 'KRW-AAA',
      first: hour(0),
      last: hour(9),
      expectedHours: 10,
      presentHours: 10,
      missingHours: 0,
      missingRatio: 0,
      gapCount: 0,
      longestGapHours: 0,
      longestGaps: [],
    });
  });

  it('여러 곳이 비면 개수·길이·시작 시각을 센다', () => {
    // 2, 5·6·7, 9가 빔
    const summary = summarizeGaps('KRW-AAA', candlesAt([0, 1, 3, 4, 8, 10]));
    expect(summary).toMatchObject({
      expectedHours: 11,
      presentHours: 6,
      missingHours: 5,
      missingRatio: 0.4545,
      gapCount: 3,
      longestGapHours: 3,
      longestGaps: [
        { from: hour(5), hours: 3 },
        { from: hour(2), hours: 1 },
        { from: hour(9), hours: 1 },
      ],
    });
  });

  it('가장 긴 빈 구간은 정해진 개수만 남긴다', () => {
    // 짝수 시간만 있음 → 1시간짜리 빈 구간이 많음, 마지막에 5시간짜리 하나
    const indexes = [...range(0, 30).filter((i) => i % 2 === 0), 36];
    const summary = summarizeGaps('KRW-AAA', candlesAt(indexes));
    expect(summary?.longestGaps).toHaveLength(LONGEST_GAPS);
    expect(summary?.longestGaps[0]).toEqual({ from: hour(31), hours: 5 });
    expect(summary?.gapCount).toBe(16);
  });
});

describe('buildGapsReport', () => {
  it('마켓 순서로 정렬하고 목록 여부·끝부분 공백·요약을 붙인다', () => {
    const a = summarizeGaps('KRW-AAA', candlesAt(range(0, 99)));
    const c = summarizeGaps('KRW-CCC', candlesAt([...range(0, 9), 20]));
    if (a === undefined || c === undefined) {
      throw new Error('준비 실패');
    }
    const report = buildGapsReport(
      [c, { market: 'KRW-BBB', error: '헤더가 다르다' }, a],
      new Set(['KRW-AAA', 'KRW-BBB']),
    );
    expect(report.summary).toEqual({ markets: 2, candles: 111, missingHours: 10, errors: 1 });
    expect(report.markets.map((m) => m.market)).toEqual(['KRW-AAA', 'KRW-BBB', 'KRW-CCC']);
    expect(report.markets[0]).toMatchObject({ inMarketList: true, staleHours: 0 });
    expect(report.markets[1]).toEqual({ market: 'KRW-BBB', error: '헤더가 다르다' });
    expect(report.markets[2]).toMatchObject({ inMarketList: false, staleHours: 79 });
  });

  it('같은 입력이면 같은 보고서 (실행 시각 없음)', () => {
    const a = summarizeGaps('KRW-AAA', candlesAt([0, 2, 3]));
    if (a === undefined) {
      throw new Error('준비 실패');
    }
    const listed = new Set(['KRW-AAA']);
    expect(JSON.stringify(buildGapsReport([a], listed))).toBe(
      JSON.stringify(buildGapsReport([a], listed)),
    );
  });
});
