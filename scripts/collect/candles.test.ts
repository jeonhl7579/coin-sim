import { describe, expect, it } from 'vitest';
import {
  type Candle,
  fetchBackward,
  HOUR_MS,
  isClosed,
  isHourIso,
  mergeCandles,
  parseCandlePage,
} from './candles';
import { fakeExchange, hour, rawCandle, TEST_MARKET } from './testing';

const MARKET = TEST_MARKET;
const raw = rawCandle;

describe('parseCandlePage', () => {
  it('업비트 필드를 data-spec 2.4 형식으로 바꾼다', () => {
    expect(
      parseCandlePage([raw('2024-01-01T01:00:00Z'), raw('2024-01-01T00:00:00Z')], MARKET),
    ).toEqual([
      {
        time: '2024-01-01T01:00:00Z',
        open: 101,
        high: 111,
        low: 91,
        close: 106,
        volume: 0.0000001,
        quoteVolume: 1000.5,
      },
      {
        time: '2024-01-01T00:00:00Z',
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 0.0000001,
        quoteVolume: 1000.5,
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

describe('mergeCandles', () => {
  const c = (time: string, close = 1): Candle => ({
    time,
    open: 1,
    high: 1,
    low: 1,
    close,
    volume: 1,
    quoteVolume: 1,
  });

  it('시각 기준으로 합치고 오름차순으로 정렬한다', () => {
    const result = mergeCandles([c(hour(1)), c(hour(3))], [c(hour(4)), c(hour(0)), c(hour(2))]);
    expect(result.candles.map((x) => x.time)).toEqual([0, 1, 2, 3, 4].map(hour));
    expect(result.added).toBe(3);
    expect(result.conflicts).toBe(0);
  });

  it('같은 시각은 기존 값을 유지하고, 값이 다르면 세기만 한다', () => {
    const result = mergeCandles([c(hour(1), 10)], [c(hour(1), 10), c(hour(1), 99)]);
    expect(result.candles).toEqual([c(hour(1), 10)]);
    expect(result.added).toBe(0);
    expect(result.conflicts).toBe(1);
  });
});
