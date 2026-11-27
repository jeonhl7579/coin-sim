import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCandlePage } from './candles';
import { collectMarket } from './collectMarket';
import { candlePath, formatCandleCsv, readCandleCsv, writeFileAtomic } from './storage';
import { fakeExchange, hour, rawCandle, TEST_MARKET } from './testing';

const MARKET = TEST_MARKET;
let rawDir: string;

beforeEach(async () => {
  rawDir = await mkdtemp(join(tmpdir(), 'coin-sim-collect-'));
});

afterEach(async () => {
  await rm(rawDir, { recursive: true, force: true });
});

function deps(ex: ReturnType<typeof fakeExchange>) {
  return { fetchPage: ex.fetchPage, now: ex.closedNow };
}

const times = async () =>
  ((await readCandleCsv(candlePath(rawDir, MARKET))) ?? []).map((c) => c.time);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => hour(from + i));

/** 거래소의 hour(from)~hour(to) 캔들로 CSV를 미리 만든다 (지난 실행이 남긴 파일) */
async function seedCsv(from: number, to: number) {
  const raws = range(from, to)
    .reverse()
    .map((t) => rawCandle(t));
  const candles = parseCandlePage(raws, MARKET).reverse();
  await writeFileAtomic(candlePath(rawDir, MARKET), formatCandleCsv(candles));
}

describe('collectMarket', () => {
  it('처음 받는 마켓은 상장 첫 캔들까지 받아 저장한다', async () => {
    const ex = fakeExchange(450);
    const { result, state } = await collectMarket(MARKET, undefined, rawDir, deps(ex));
    expect(await times()).toEqual(range(0, 449));
    expect(state).toEqual({ reachedStart: true });
    expect(result).toMatchObject({ addedNew: 450, addedOld: 0, total: 450, pages: 3 });
  });

  it('곧바로 다시 실행하면 요청 1건, 파일은 바이트 단위로 같다', async () => {
    const ex = fakeExchange(450);
    const first = await collectMarket(MARKET, undefined, rawDir, deps(ex));
    const before = await readFile(candlePath(rawDir, MARKET), 'utf8');
    ex.requests.length = 0;

    const again = await collectMarket(MARKET, first.state, rawDir, deps(ex));
    expect(ex.requests).toEqual([undefined]);
    expect(again.result).toMatchObject({ addedNew: 0, addedOld: 0, total: 450, pages: 1 });
    expect(await readFile(candlePath(rawDir, MARKET), 'utf8')).toBe(before);
  });

  it('새 캔들만 이어 받는다', async () => {
    const ex = fakeExchange(450);
    const first = await collectMarket(MARKET, undefined, rawDir, deps(ex));
    ex.setTotal(470);
    const again = await collectMarket(MARKET, first.state, rawDir, deps(ex));
    expect(again.result).toMatchObject({ addedNew: 20, addedOld: 0, total: 470 });
    expect(await times()).toEqual(range(0, 469));
  });

  it('첫 캔들에 닿지 않았으면 과거 쪽을 이어 받는다 (끊긴 뒤 다시 실행)', async () => {
    const ex = fakeExchange(800);
    await seedCsv(500, 799);
    const { result, state } = await collectMarket(
      MARKET,
      { reachedStart: false },
      rawDir,
      deps(ex),
    );
    expect(await times()).toEqual(range(0, 799));
    expect(state).toEqual({ reachedStart: true });
    expect(result).toMatchObject({ addedNew: 0, addedOld: 500 });
    // 새 캔들 확인 1건 + 과거 hour(500) 이전부터 3건
    expect(ex.requests).toEqual([undefined, hour(500), hour(300), hour(100)]);
  });

  it('빈 시간이 있어도 다시 실행하면 같은 결과', async () => {
    const ex = fakeExchange(450, [10, 11, 200, 449]);
    const first = await collectMarket(MARKET, undefined, rawDir, deps(ex));
    const before = await readFile(candlePath(rawDir, MARKET), 'utf8');
    await collectMarket(MARKET, first.state, rawDir, deps(ex));
    expect(await readFile(candlePath(rawDir, MARKET), 'utf8')).toBe(before);
    expect((await times()).length).toBe(446);
  });

  it('기존 CSV가 깨져 있으면 예외, 파일은 그대로', async () => {
    const ex = fakeExchange(450);
    await seedCsv(0, 9);
    const path = candlePath(rawDir, MARKET);
    const broken = `${await readFile(path, 'utf8')}oops\n`;
    await writeFile(path, broken, 'utf8');
    await expect(collectMarket(MARKET, undefined, rawDir, deps(ex))).rejects.toThrow('칸 수');
    expect(await readFile(path, 'utf8')).toBe(broken);
    expect(ex.requests).toEqual([]);
  });
});
