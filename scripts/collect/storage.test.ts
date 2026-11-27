import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Candle } from './candles';
import {
  CSV_HEADER,
  type CollectState,
  formatCandleCsv,
  parseCandleCsv,
  parseState,
  readCandleCsv,
  readState,
  writeFileAtomic,
  writeJsonAtomic,
  writeState,
} from './storage';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'coin-sim-storage-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('없는 폴더를 만들고 쓰며, 임시 파일을 남기지 않는다', async () => {
    const path = join(dir, 'a', 'b', 'file.txt');
    await writeFileAtomic(path, 'hello');
    expect(await readFile(path, 'utf8')).toBe('hello');
    expect(await readdir(join(dir, 'a', 'b'))).toEqual(['file.txt']);
  });

  it('기존 파일을 덮어쓴다', async () => {
    const path = join(dir, 'file.txt');
    await writeFileAtomic(path, 'old');
    await writeFileAtomic(path, 'new');
    expect(await readFile(path, 'utf8')).toBe('new');
  });

  it('JSON은 들여쓰기 2칸과 마지막 줄바꿈', async () => {
    const path = join(dir, 'x.json');
    await writeJsonAtomic(path, { a: 1 });
    expect(await readFile(path, 'utf8')).toBe('{\n  "a": 1\n}\n');
  });
});

describe('캔들 CSV', () => {
  const candles: Candle[] = [
    {
      time: '2024-01-01T00:00:00Z',
      open: 0.0001234,
      high: 0.00013,
      low: 0.00012,
      close: 0.000125,
      volume: 123456789012.5,
      quoteVolume: 1e21,
    },
    {
      time: '2024-01-01T02:00:00Z',
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 0.0000001,
      quoteVolume: 1000.123456789,
    },
  ];

  it('헤더와 오름차순 행으로 쓰고, 값을 그대로 되읽는다 (반올림 없음)', () => {
    const text = formatCandleCsv(candles);
    expect(text.split('\n')[0]).toBe(CSV_HEADER);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('2024-01-01T02:00:00Z,100,110,90,105,1e-7,1000.123456789');
    expect(parseCandleCsv(text, 'x')).toEqual(candles);
  });

  it('행이 없으면 헤더만', () => {
    expect(formatCandleCsv([])).toBe(`${CSV_HEADER}\n`);
    expect(parseCandleCsv(`${CSV_HEADER}\n`, 'x')).toEqual([]);
  });

  const row = (time: string, rest = '1,1,1,1,1,1') => `${time},${rest}`;
  it.each([
    ['헤더가 다름', 'time,open\n', '헤더가 다르다'],
    ['칸 수', `${CSV_HEADER}\n${row('2024-01-01T00:00:00Z', '1,1,1')}\n`, '칸 수'],
    ['시각 형식', `${CSV_HEADER}\n${row('2024-01-01 00:00:00')}\n`, 'time 형식'],
    ['빈 값', `${CSV_HEADER}\n${row('2024-01-01T00:00:00Z', '1,,1,1,1,1')}\n`, '숫자가 아닌'],
    ['음수', `${CSV_HEADER}\n${row('2024-01-01T00:00:00Z', '1,1,-1,1,1,1')}\n`, '숫자가 아닌'],
    [
      '중복',
      `${CSV_HEADER}\n${row('2024-01-01T00:00:00Z')}\n${row('2024-01-01T00:00:00Z')}\n`,
      '오름차순',
    ],
    [
      '역순',
      `${CSV_HEADER}\n${row('2024-01-01T01:00:00Z')}\n${row('2024-01-01T00:00:00Z')}\n`,
      '오름차순',
    ],
  ])('%s이면 예외', (_name, text, message) => {
    expect(() => parseCandleCsv(text, 'x.csv')).toThrow(message);
  });

  it('파일이 없으면 undefined', async () => {
    expect(await readCandleCsv(join(dir, 'none.csv'))).toBeUndefined();
  });
});

describe('수집 상태', () => {
  it('파일이 없으면 빈 상태', async () => {
    expect(await readState(join(dir, 'state.json'))).toEqual({ markets: {}, lastRun: null });
  });

  it('마켓을 코드 순서로 쓰고 그대로 되읽는다', async () => {
    const path = join(dir, 'state.json');
    const state: CollectState = {
      markets: { 'KRW-CCC': { reachedStart: false }, 'KRW-AAA': { reachedStart: true } },
      lastRun: {
        startedAt: '2026-11-28T00:00:00Z',
        finishedAt: null,
        status: 'running',
        requests: 3,
        failedMarkets: ['KRW-BBB'],
      },
    };
    await writeState(path, state);
    const text = await readFile(path, 'utf8');
    expect(text.indexOf('KRW-AAA')).toBeLessThan(text.indexOf('KRW-CCC'));
    expect(await readState(path)).toEqual(state);
  });

  it.each([
    ['배열', []],
    ['markets 없음', { lastRun: null }],
    ['reachedStart가 불리언 아님', { markets: { 'KRW-AAA': { reachedStart: 'yes' } } }],
    [
      '모르는 status',
      {
        markets: {},
        lastRun: {
          startedAt: 'x',
          finishedAt: null,
          status: 'done',
          requests: 0,
          failedMarkets: [],
        },
      },
    ],
  ])('형식이 다르면 예외: %s', (_name, raw) => {
    expect(() => parseState(raw)).toThrow('형식이 다르다');
  });

  it('깨진 JSON이면 예외', async () => {
    const path = join(dir, 'state.json');
    await writeFile(path, '{', 'utf8');
    await expect(readState(path)).rejects.toThrow();
  });
});
