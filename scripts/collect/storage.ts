// data/raw/ 파일 읽기·쓰기 (data-spec 2.4, 2.5)
// 쓰기는 임시 파일에 쓴 뒤 이름을 바꿔서 중간에 끊겨도 파일이 깨지지 않게 한다 (D-59).

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { type Candle, isHourIso } from './candles';

const TEMP_SUFFIX = /\.tmp-\d+$/;

export async function writeFileAtomic(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, path);
}

/**
 * 쓰는 도중에 끊긴 실행이 남긴 임시 파일(`*.tmp-<pid>`)을 지우고 개수를 돌려준다.
 * 수집기를 동시에 두 개 돌리지 않는다는 전제다 (data-spec 2.7).
 */
export async function removeTempFiles(dir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
  const temps = entries.filter((entry) => TEMP_SUFFIX.test(basename(entry)));
  await Promise.all(temps.map((entry) => rm(join(dir, entry), { force: true })));
  return temps.length;
}

export function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  return writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

// ── 캔들 CSV (data-spec 2.4) ─────────────────────────────────

export const CSV_HEADER = 'time,open,high,low,close,volume,quote_volume';

export function candlePath(rawDir: string, market: string): string {
  return join(rawDir, 'candles', '1h', `${market}.csv`);
}

/** 숫자는 JS 기본 변환으로 쓴다. 값을 정확히 되살리는 가장 짧은 표기이며 반올림하지 않는다 */
export function formatCandleCsv(candles: Candle[]): string {
  const rows = candles.map((c) =>
    [c.time, c.open, c.high, c.low, c.close, c.volume, c.quoteVolume].join(','),
  );
  return `${[CSV_HEADER, ...rows].join('\n')}\n`;
}

/** CSV를 검사하며 읽는다. 헤더·시각 형식·숫자·오름차순·중복 중 하나라도 틀리면 예외 */
export function parseCandleCsv(text: string, where: string): Candle[] {
  const lines = text.split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  if (lines[0] !== CSV_HEADER) {
    throw new Error(`${where}: 헤더가 다르다`);
  }
  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const fields = (lines[i] ?? '').split(',');
    const at = `${where} ${i + 1}번째 줄`;
    if (fields.length !== 7) {
      throw new Error(`${at}: 칸 수가 7이 아니다`);
    }
    const [time = '', ...rest] = fields;
    if (!isHourIso(time)) {
      throw new Error(`${at}: time 형식이 다르다`);
    }
    const numbers = rest.map((field) => {
      const value = field === '' ? Number.NaN : Number(field);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${at}: 0 이상의 숫자가 아닌 값이 있다`);
      }
      return value;
    });
    const [open = 0, high = 0, low = 0, close = 0, volume = 0, quoteVolume = 0] = numbers;
    const previous = candles.at(-1);
    if (previous !== undefined && previous.time >= time) {
      throw new Error(`${at}: time이 오름차순이 아니거나 중복이다`);
    }
    candles.push({ time, open, high, low, close, volume, quoteVolume });
  }
  return candles;
}

/** candles/1h/ 아래 CSV가 있는 마켓 코드, 오름차순. 폴더가 없으면 빈 배열 */
export async function listCandleMarkets(rawDir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(join(rawDir, 'candles', '1h'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return names
    .filter((name) => name.endsWith('.csv'))
    .map((name) => name.slice(0, -'.csv'.length))
    .sort();
}

/** 파일이 없으면 undefined */
export async function readCandleCsv(path: string): Promise<Candle[] | undefined> {
  const text = await readTextIfExists(path);
  return text === undefined ? undefined : parseCandleCsv(text, path);
}

// ── 수집 상태 (data-spec 2.5) ────────────────────────────────

export interface MarketState {
  /** 상장 후 첫 캔들까지 과거 방향으로 다 받았는지 */
  reachedStart: boolean;
}

/** running이 남아 있으면 실행이 중간에 끊긴 것이다 */
export type RunStatus = 'running' | 'ok' | 'partial' | 'failed';

export interface LastRun {
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  requests: number;
  failedMarkets: string[];
}

export interface CollectState {
  markets: Record<string, MarketState>;
  lastRun: LastRun | null;
}

const RUN_STATUSES: readonly string[] = ['running', 'ok', 'partial', 'failed'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLastRun(raw: unknown): LastRun | null {
  if (raw === null) {
    return null;
  }
  if (
    !isRecord(raw) ||
    typeof raw.startedAt !== 'string' ||
    !(raw.finishedAt === null || typeof raw.finishedAt === 'string') ||
    typeof raw.status !== 'string' ||
    !RUN_STATUSES.includes(raw.status) ||
    typeof raw.requests !== 'number' ||
    !Array.isArray(raw.failedMarkets) ||
    !raw.failedMarkets.every((m) => typeof m === 'string')
  ) {
    throw new Error('state.json의 lastRun 형식이 다르다');
  }
  return {
    startedAt: raw.startedAt,
    finishedAt: raw.finishedAt,
    status: raw.status as RunStatus,
    requests: raw.requests,
    failedMarkets: raw.failedMarkets,
  };
}

export function parseState(raw: unknown): CollectState {
  if (!isRecord(raw) || !isRecord(raw.markets)) {
    throw new Error('state.json 형식이 다르다');
  }
  const markets: Record<string, MarketState> = {};
  for (const [market, value] of Object.entries(raw.markets)) {
    if (!isRecord(value) || typeof value.reachedStart !== 'boolean') {
      throw new Error(`state.json의 ${market} 형식이 다르다`);
    }
    markets[market] = { reachedStart: value.reachedStart };
  }
  return { markets, lastRun: parseLastRun(raw.lastRun ?? null) };
}

/** 파일이 없으면 빈 상태 */
export async function readState(path: string): Promise<CollectState> {
  const text = await readTextIfExists(path);
  return text === undefined ? { markets: {}, lastRun: null } : parseState(JSON.parse(text));
}

/** 마켓은 코드 오름차순으로 쓴다 */
export function writeState(path: string, state: CollectState): Promise<void> {
  const markets = Object.fromEntries(
    Object.keys(state.markets)
      .sort()
      .map((market) => [market, state.markets[market]]),
  );
  return writeJsonAtomic(path, { markets, lastRun: state.lastRun });
}
