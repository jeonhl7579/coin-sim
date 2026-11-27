// 수집기 테스트용 가짜 업비트 응답 (테스트 파일에서만 import한다). 실제 코인 이름은 쓰지 않는다 (D-56).

import { HOUR_MS } from './candles';

export const TEST_MARKET = 'KRW-AAA';

/** 2024-01-01T00:00:00Z부터 i시간 뒤 */
export const hour = (i: number): string =>
  new Date(Date.UTC(2024, 0, 1) + i * HOUR_MS).toISOString().replace('.000', '');

/** 업비트 응답 형식의 가짜 캔들. 가격은 시각마다 달라서 행을 구분할 수 있다 */
export function rawCandle(time: string, overrides: Record<string, unknown> = {}) {
  const i = (Date.parse(time) - Date.UTC(2024, 0, 1)) / HOUR_MS;
  return {
    market: TEST_MARKET,
    candle_date_time_utc: time.replace(/Z$/, ''),
    candle_date_time_kst: 'ignored',
    opening_price: 100 + i,
    high_price: 110 + i,
    low_price: 90 + i,
    trade_price: 105 + i,
    timestamp: 0,
    candle_acc_trade_price: 1000.5,
    candle_acc_trade_volume: 0.0000001,
    unit: 60,
    ...overrides,
  };
}

/**
 * 첫 캔들 hour(0)부터 hour(total-1)까지 있는 가짜 거래소. total은 나중에 늘릴 수 있다 (새 캔들).
 * missing에 든 시간은 체결이 없어 캔들이 없다. 응답은 to 이전(미포함) 최신 200개, 최신 → 과거.
 */
export function fakeExchange(initialTotal: number, missing: number[] = []) {
  let total = initialTotal;
  const requests: (string | undefined)[] = [];
  const times = () =>
    Array.from({ length: total }, (_, i) => i)
      .filter((i) => !missing.includes(i))
      .map((i) => hour(i));
  return {
    requests,
    setTotal: (n: number) => {
      total = n;
    },
    /** 마지막 캔들까지 끝난 시각 */
    closedNow: () => Date.parse(hour(total)),
    fetchPage: (market: string, to?: string) => {
      requests.push(to);
      const all = times();
      const older = to === undefined ? all : all.filter((t) => t < to);
      return Promise.resolve(
        older
          .slice(-200)
          .reverse()
          .map((t) => rawCandle(t, { market })),
      );
    },
  };
}
