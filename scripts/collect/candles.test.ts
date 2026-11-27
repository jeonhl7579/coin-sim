import { describe, expect, it } from 'vitest';
import {
  type Candle,
  fetchBackward,
  HOUR_MS,
  isClosed,
  isHourIso,
  parseCandlePage,
} from './candles';

const MARKET = 'KRW-AAA';

/** 업비트 응답 형식의 가짜 캔들 */
function raw(time: string, overrides: Record<string, unknown> = {}) {
  return {
    market: MARKET,
    candle_date_time_utc: time.replace(/Z$/, ''),
    candle_date_time_kst: 'ignored',
    opening_price: 100,
    high_price: 110,
    low_price: 90,
    trade_price: 105,
    timestamp: 0,
    candle_acc_trade_price: 1000,
    candle_acc_trade_volume: 10,
    unit: 60,
    ...overrides,
  };
}

const hour = (i: number) =>
  new Date(Date.UTC(2024, 0, 1) + i * HOUR_MS).toISOString().replace('.000', '');

/**
 * 첫 캔들 hour(0)부터 hour(total-1)까지 있는 가짜 거래소.
 * missing에 든 시간은 체결이 없어 캔들이 없다. 응답은 to 이전(미포함) 최신 200개, 최신 → 과거.
 */
function fakeExchange(total: number, missing: number[] = []) {
  const all = Array.from({ length: total }, (_, i) => i)
    .filter((i) => !missing.includes(i))
    .map((i) => hour(i));
  const requests: (string | undefined)[] = [];
  return {
    requests,
    fetchPage: (market: string, to?: string) => {
      requests.push(to);
      const older = to === undefined ? all : all.filter((t) => t < to);
      return Promise.resolve(
        older
          .slice(-200)
          .reverse()
          .map((t) => raw(t, { market })),
      );
    },
  };
}

describe('parseCandlePage', () => {
  it('업비트 필드를 data-spec 2.4 형식으로 바꾼다', () => {
    expect(
      parseCandlePage([raw('2024-01-01T01:00:00Z'), raw('2024-01-01T00:00:00Z')], MARKET),
    ).toEqual([
      {
        time: '2024-01-01T01:00:00Z',
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 10,
        quoteVolume: 1000,
      },
      {
        time: '2024-01-01T00:00:00Z',
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 10,
        quoteVolume: 1000,
      },
    ]);
  });

  it.each([
    ['배열이 아님', { error: {} }, '배열이 아니다'],
    ['market이 다름', [raw('2024-01-01T00:00:00Z', { market: 'KRW-BBB' })], 'market이 다르다'],
    ['unit이 다름', [raw('2024-01-01T00:00:00Z', { unit: 1 })], 'unit이 60이 아니다'],
    ['정각이 아님', [raw('2024-01-01T00:30:00Z')], '형식이 다르다'],
    ['숫자가 아님', [raw('2024-01-01T00:00:00Z', { trade_price: '105' })], 'trade_price'],
    [
      '음수',
      [raw('2024-01-01T00:00:00Z', { candle_acc_trade_volume: -1 })],
      'candle_acc_trade_volume',
    ],
    [
      '순서가 다름',
      [raw('2024-01-01T00:00:00Z'), raw('2024-01-01T01:00:00Z')],
      '최신 → 과거 순서가 아니다',
    ],
  ])('%s이면 예외', (_name, input, message) => {
    expect(() => parseCandlePage(input, MARKET)).toThrow(message);
  });
});

describe('isHourIso, isClosed', () => {
  it('정각 UTC 형식만 허용', () => {
    expect(isHourIso('2024-01-01T00:00:00Z')).toBe(true);
    expect(isHourIso('2024-01-01T00:00:00')).toBe(false);
    expect(isHourIso('2024-13-01T00:00:00Z')).toBe(false);
  });

  it('time + 1시간이 요청 시각 이하일 때만 끝난 캔들', () => {
    const candle = { time: '2024-01-01T00:00:00Z' } as Candle;
    const start = Date.parse(candle.time);
    expect(isClosed(candle, start + HOUR_MS)).toBe(true);
    expect(isClosed(candle, start + HOUR_MS - 1)).toBe(false);
  });
});

describe('fetchBackward', () => {
  const longAfter = () => Date.parse(hour(10_000));

  it('상장 첫 캔들까지 200개씩 이어 받고 오름차순으로 돌려준다', async () => {
    const ex = fakeExchange(450);
    const result = await fetchBackward(MARKET, {}, { fetchPage: ex.fetchPage, now: longAfter });
    expect(result.candles).toHaveLength(450);
    expect(result.candles[0]?.time).toBe(hour(0));
    expect(result.candles.at(-1)?.time).toBe(hour(449));
    expect(result.reachedStart).toBe(true);
    expect(result.pages).toBe(3);
    // 다음 요청의 to = 이전 페이지에서 가장 오래된 캔들 시각
    expect(ex.requests).toEqual([undefined, hour(250), hour(50)]);
  });

  it('빈 시간이 있어도 중복·누락 없이 받는다', async () => {
    const missing = [3, 4, 5, 199, 250, 251];
    const ex = fakeExchange(500, missing);
    const result = await fetchBackward(MARKET, {}, { fetchPage: ex.fetchPage, now: longAfter });
    const times = result.candles.map((c) => c.time);
    expect(new Set(times).size).toBe(times.length);
    expect(times).toHaveLength(500 - missing.length);
  });

  it('개수가 정확히 200의 배수면 빈 응답에서 첫 캔들 도달', async () => {
    const ex = fakeExchange(400);
    const result = await fetchBackward(MARKET, {}, { fetchPage: ex.fetchPage, now: longAfter });
    expect(result.candles).toHaveLength(400);
    expect(result.reachedStart).toBe(true);
    expect(result.pages).toBe(3);
  });

  it('to부터 과거만 받는다', async () => {
    const ex = fakeExchange(450);
    const result = await fetchBackward(
      MARKET,
      { to: hour(100) },
      { fetchPage: ex.fetchPage, now: longAfter },
    );
    expect(result.candles.map((c) => c.time)).toEqual(
      Array.from({ length: 100 }, (_, i) => hour(i)),
    );
  });

  it('stopAtOrBefore에 닿으면 멈추고 그 캔들은 버린다 (새 캔들만 받기)', async () => {
    const ex = fakeExchange(450);
    const result = await fetchBackward(
      MARKET,
      { stopAtOrBefore: hour(440) },
      { fetchPage: ex.fetchPage, now: longAfter },
    );
    expect(result.candles.map((c) => c.time)).toEqual(
      Array.from({ length: 9 }, (_, i) => hour(441 + i)),
    );
    expect(result.reachedStart).toBe(false);
    expect(result.pages).toBe(1);
  });

  it('진행 중인 캔들은 버린다', async () => {
    const ex = fakeExchange(10);
    // 요청 시각이 마지막 캔들(hour(9)) 중간
    const now = () => Date.parse(hour(9)) + 30 * 60_000;
    const result = await fetchBackward(MARKET, {}, { fetchPage: ex.fetchPage, now });
    expect(result.candles.at(-1)?.time).toBe(hour(8));
  });

  it('maxPages에서 멈춘다', async () => {
    const ex = fakeExchange(1000);
    const result = await fetchBackward(
      MARKET,
      { maxPages: 2 },
      { fetchPage: ex.fetchPage, now: longAfter },
    );
    expect(result.pages).toBe(2);
    expect(result.candles).toHaveLength(400);
    expect(result.reachedStart).toBe(false);
  });

  it('응답이 to 이후 캔들을 주면 무한 반복 대신 예외', async () => {
    const stuck = () => Promise.resolve(Array.from({ length: 200 }, (_, i) => raw(hour(500 - i))));
    await expect(
      fetchBackward(MARKET, { to: hour(400) }, { fetchPage: stuck, now: longAfter }),
    ).rejects.toThrow('이후 캔들이 있다');
  });

  it('to 형식이 다르면 예외', async () => {
    const ex = fakeExchange(10);
    await expect(
      fetchBackward(
        MARKET,
        { to: '2024-01-01 00:00:00' },
        { fetchPage: ex.fetchPage, now: longAfter },
      ),
    ).rejects.toThrow('to 형식이 다르다');
  });
});
