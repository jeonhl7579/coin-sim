// 1시간 캔들 형식과 과거 방향 나눠 받기 (data-spec 2.4, 2.5)

import { CANDLE_PAGE_SIZE } from './upbit';

/** data-spec 2.4의 CSV 한 행 */
export interface Candle {
  /** 캔들 시작 시각, UTC ISO 8601 (예: 2017-09-25T03:00:00Z) */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

export const HOUR_MS = 3_600_000;

/** 정각 시각 문자열 (예: 2017-09-25T03:00:00Z). 같은 형식끼리는 문자열 비교가 시각 비교와 같다 */
const HOUR_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/;

export function isHourIso(value: string): boolean {
  return HOUR_ISO.test(value) && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(item: Record<string, unknown>, key: string, where: string): number {
  const value = item[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${where}: ${key}가 0 이상의 숫자가 아니다`);
  }
  return value;
}

/** 캔들 응답 한 페이지를 검사해 응답 순서(최신 → 과거) 그대로 돌려준다. 형식이 다르면 예외. */
export function parseCandlePage(raw: unknown, market: string): Candle[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${market} 캔들 응답이 배열이 아니다`);
  }
  const candles = raw.map((item: unknown, i): Candle => {
    const where = `${market} 캔들 응답 ${i}번째`;
    if (!isRecord(item)) {
      throw new Error(`${where}: 객체가 아니다`);
    }
    if (item.market !== market) {
      throw new Error(`${where}: market이 다르다`);
    }
    if (item.unit !== 60) {
      throw new Error(`${where}: unit이 60이 아니다`);
    }
    const utc = item.candle_date_time_utc;
    const time = typeof utc === 'string' ? `${utc}Z` : '';
    if (!isHourIso(time)) {
      throw new Error(`${where}: candle_date_time_utc 형식이 다르다`);
    }
    return {
      time,
      open: readNumber(item, 'opening_price', where),
      high: readNumber(item, 'high_price', where),
      low: readNumber(item, 'low_price', where),
      close: readNumber(item, 'trade_price', where),
      volume: readNumber(item, 'candle_acc_trade_volume', where),
      quoteVolume: readNumber(item, 'candle_acc_trade_price', where),
    };
  });
  for (let i = 1; i < candles.length; i += 1) {
    const newer = candles[i - 1];
    const older = candles[i];
    if (newer !== undefined && older !== undefined && older.time >= newer.time) {
      throw new Error(`${market} 캔들 응답이 최신 → 과거 순서가 아니다 (${i}번째)`);
    }
  }
  return candles;
}

/** 끝난 캔들인지 (time + 1시간 ≤ 요청 시각). 진행 중인 캔들은 저장하지 않는다 (data-spec 2.4) */
export function isClosed(candle: Candle, requestTimeMs: number): boolean {
  return Date.parse(candle.time) + HOUR_MS <= requestTimeMs;
}

export interface MergeResult {
  /** time 오름차순, 중복 없음 */
  candles: Candle[];
  /** 새로 들어간 캔들 수 */
  added: number;
  /** 같은 time인데 값이 다른 캔들 수 (기존 값을 유지함) */
  conflicts: number;
}

function sameValues(a: Candle, b: Candle): boolean {
  return (
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume &&
    a.quoteVolume === b.quoteVolume
  );
}

/** 시각 기준으로 합친다. 같은 time이면 기존 캔들을 유지한다 (끝난 캔들은 바뀌지 않음, data-spec 2.5) */
export function mergeCandles(existing: Candle[], incoming: Candle[]): MergeResult {
  const byTime = new Map(existing.map((c) => [c.time, c]));
  let added = 0;
  let conflicts = 0;
  for (const candle of incoming) {
    const kept = byTime.get(candle.time);
    if (kept === undefined) {
      byTime.set(candle.time, candle);
      added += 1;
    } else if (!sameValues(kept, candle)) {
      conflicts += 1;
    }
  }
  const candles = [...byTime.values()].sort((a, b) =>
    a.time < b.time ? -1 : a.time > b.time ? 1 : 0,
  );
  return { candles, added, conflicts };
}

export interface FetchBackwardOptions {
  /** 이 시각 이전(미포함)부터 받는다. 없으면 최신부터 */
  to?: string;
  /** 이 시각 이하의 캔들에 닿으면 멈춘다. 그 캔들은 버린다 (새 캔들만 받을 때) */
  stopAtOrBefore?: string;
  /** 최대 페이지 수 (확인용) */
  maxPages?: number;
}

export interface FetchBackwardDeps {
  fetchPage(market: string, to?: string): Promise<unknown>;
  now(): number;
}

export interface FetchBackwardResult {
  /** 끝난 캔들, time 오름차순 */
  candles: Candle[];
  /** 상장 첫 캔들까지 받았는지 (200개보다 적거나 빈 응답) */
  reachedStart: boolean;
  pages: number;
}

/** 최신에서 과거 방향으로 200개씩 받는다. 다음 요청의 to = 이번 페이지에서 가장 오래된 캔들 시각. */
export async function fetchBackward(
  market: string,
  options: FetchBackwardOptions,
  deps: FetchBackwardDeps,
): Promise<FetchBackwardResult> {
  for (const [key, value] of [
    ['to', options.to],
    ['stopAtOrBefore', options.stopAtOrBefore],
  ] as const) {
    if (value !== undefined && !isHourIso(value)) {
      throw new Error(`${market} ${key} 형식이 다르다: ${value}`);
    }
  }

  const newestFirst: Candle[] = [];
  let to = options.to;
  let reachedStart = false;
  let pages = 0;

  for (;;) {
    if (options.maxPages !== undefined && pages >= options.maxPages) {
      break;
    }
    const requestTime = deps.now();
    const page = parseCandlePage(await deps.fetchPage(market, to), market);
    pages += 1;

    const newest = page[0];
    const oldest = page[page.length - 1];
    if (newest === undefined || oldest === undefined) {
      reachedStart = true;
      break;
    }
    if (to !== undefined && newest.time >= to) {
      // to가 앞으로 가지 않으면 같은 페이지를 끝없이 받게 된다
      throw new Error(`${market} 캔들 응답에 to(${to}) 이후 캔들이 있다`);
    }

    let hitStop = false;
    for (const candle of page) {
      if (options.stopAtOrBefore !== undefined && candle.time <= options.stopAtOrBefore) {
        hitStop = true;
        break;
      }
      if (isClosed(candle, requestTime)) {
        newestFirst.push(candle);
      }
    }
    if (hitStop) {
      break;
    }
    if (page.length < CANDLE_PAGE_SIZE) {
      reachedStart = true;
      break;
    }
    to = oldest.time;
  }

  return { candles: newestFirst.reverse(), reachedStart, pages };
}
